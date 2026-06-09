"""LLM client: async-first `call_llm_async` + `stream_llm_text`, with a
synchronous `call_llm` wrapper for non-chat callers.

`call_llm_async` retries on transient HTTP failures (408, 425, 429, 5xx)
with exponential backoff using `asyncio.sleep` (non-blocking).
`stream_llm_text` does NOT retry — once we've started delivering tokens
to the user, a partial retry would create duplicates.

Config is cached in memory and only re-read from disk when the file's
mtime changes. Call `invalidate_config_cache()` after writing to the
config file to force an immediate refresh.
"""
import asyncio
import json
import logging
import os
import time
from typing import Any, AsyncGenerator

import httpx

from .logging_setup import get_request_id

LOG = logging.getLogger('vantageo.llm')

PROVIDER_CONFIGS: dict[str, dict[str, Any]] = {
    'nvidia': {
        'url': 'https://integrate.api.nvidia.com/v1/chat/completions',
        'model': 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
        'key_env': 'NVIDIA_API_KEY',
        'extra_fields': {'chat_template_kwargs': {'thinking': False}},
    },
    'commandcode': {
        'url': 'https://api.commandcode.ai/provider/v1/chat/completions',
        'model': 'deepseek/deepseek-v4-flash',
        'key_env': 'CC_LLM_API_KEY',
    },
}
DEFAULT_PROVIDER = 'nvidia'

# HTTP status codes that warrant a retry on the synchronous path.
_RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 3
_RETRY_BASE_DELAY = 0.8  # seconds; doubled on each attempt

# Per-phase timeouts. The total wall-clock for a streaming call is bounded
# by (read * num_chunks); in practice the 60s read timeout covers the
# inter-token gaps, with a fast connect budget.
_STREAM_TIMEOUT = httpx.Timeout(connect=10, read=120, write=10, pool=10)
_NONSTREAM_TIMEOUT = 60.0

# ---- Config cache (avoids re-reading the JSON file on every LLM call) ----
_config_cache: dict[str, Any] = {}  # {path: {'data': dict, 'mtime': float}}
_FALLBACK_CFG = {
    'provider': os.environ.get('VANTAGEO_LLM_PROVIDER', DEFAULT_PROVIDER),
    'model': os.environ.get('VANTAGEO_LLM_MODEL', ''),
    'api_key': '',
}


def invalidate_config_cache():
    """Force a re-read of the config file on the next LLM call.
    Call this after writing to the config file via POST /api/config."""
    _config_cache.clear()


def _load_config(config_path) -> dict:
    """Resolve LLM config with mtime-based caching.

    Reads from disk only when the file has changed since the last read.
    Order of precedence:
    1. JSON file at `config_path`
    2. Environment variables (fallback when file is missing/unreadable)
    """
    if not config_path or not os.path.isfile(config_path):
        return dict(_FALLBACK_CFG)
    try:
        mtime = os.path.getmtime(config_path)
    except OSError:
        return dict(_FALLBACK_CFG)

    cached = _config_cache.get(config_path)
    if cached and cached['mtime'] == mtime:
        return cached['data']

    try:
        with open(config_path, 'r') as f:
            data = json.load(f)
        _config_cache[config_path] = {'data': data, 'mtime': mtime}
        return data
    except (OSError, json.JSONDecodeError) as e:
        LOG.warning('Failed to read config at %s: %s', config_path, e)
        return dict(_FALLBACK_CFG)


def _resolve(cfg: dict) -> tuple[str, dict, str, str]:
    """Return (provider, provider_config, url, model)."""
    provider = cfg.get('provider', DEFAULT_PROVIDER)
    prov = PROVIDER_CONFIGS.get(provider, PROVIDER_CONFIGS[DEFAULT_PROVIDER])
    url = os.environ.get('CC_LLM_ENDPOINT', cfg.get('endpoint', prov['url']))
    model = cfg.get('model') or prov['model']
    return provider, prov, url, model


def _api_key(cfg: dict, provider: str, prov: dict) -> str:
    key = cfg.get('api_key')
    if not key:
        key = os.environ.get(prov['key_env'], '')
    if not key and provider == 'commandcode':
        # Commandcode docs use CMD_API_KEY; we also accept CC_LLM_API_KEY
        # (our historical name) and OPENAI_API_KEY (any OpenAI-compat key)
        # so the same code works against any OpenAI-shaped provider.
        key = (
            os.environ.get('CMD_API_KEY')
            or os.environ.get('CC_LLM_API_KEY')
            or os.environ.get('OPENAI_API_KEY')
            or ''
        )
    return key or ''


def _build_body(
    messages: list[dict],
    tools: list[dict] | None,
    cfg: dict,
    stream: bool = False,
) -> tuple[str, str, dict[str, Any], dict]:
    """Build (url, api_key, body, provider_config) for LLM requests."""
    provider, prov, url, model = _resolve(cfg)
    api_key = _api_key(cfg, provider, prov)
    body: dict[str, Any] = {
        'model': model,
        'messages': messages,
        'temperature': 0.3,
        'max_tokens': 4000,
    }
    if stream:
        body['stream'] = True
    if tools:
        body['tools'] = tools
    if prov.get('extra_fields'):
        body.update(prov['extra_fields'])
    return url, api_key, body, prov


def _handle_retryable(status_code: int, attempt: int, error) -> bool:
    """Log retryable status; returns True if caller should retry."""
    if status_code in _RETRYABLE_STATUS and attempt < _MAX_ATTEMPTS:
        delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
        LOG.warning('LLM %d — retrying in %.1fs (attempt %d)',
                    status_code, delay, attempt + 1)
        return True
    return False


def _soft_error_msg(error: Exception | None) -> str:
    """Build a user-facing error message from the last exception."""
    if isinstance(error, httpx.HTTPStatusError):
        return (f'LLM API error ({error.response.status_code}). '
                'Please check your API key and model name in Configuration.')
    return ('Unable to reach the LLM API. '
            'Please check your network connection and API endpoint.')


async def call_llm_async(
    messages: list[dict],
    tools: list[dict] | None = None,
    config_path: str | os.PathLike | None = None,
) -> dict:
    """Async, retried LLM call. Non-blocking — uses `asyncio.sleep` for
    retry delays so the event loop stays free for other coroutines.

    Returns the parsed JSON response. On exhausted retries returns a
    soft-error shape: `{'choices': [{'message': {'content': '...'}}]}`.
    """
    cfg = _load_config(config_path)
    url, api_key, body, _ = _build_body(messages, tools, cfg)

    last_error: Exception | None = None
    async with httpx.AsyncClient() as client:
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            LOG.info(
                'LLM async call attempt=%d/%d url=%s tools=%s rid=%s',
                attempt, _MAX_ATTEMPTS, url, bool(tools), get_request_id(),
            )
            try:
                r = await client.post(
                    url,
                    json=body,
                    headers={
                        'Authorization': f'Bearer {api_key}',
                        'Content-Type': 'application/json',
                    },
                    timeout=_NONSTREAM_TIMEOUT,
                )
                if _handle_retryable(r.status_code, attempt, None):
                    await asyncio.sleep(_RETRY_BASE_DELAY * (2 ** (attempt - 1)))
                    continue
                r.raise_for_status()
                return r.json()
            except httpx.HTTPStatusError as e:
                last_error = e
                LOG.error('LLM HTTP %d: %s', e.response.status_code, e.response.text[:200])
                break
            except httpx.RequestError as e:
                last_error = e
                LOG.warning('LLM request error attempt=%d: %s', attempt, e)
                if attempt < _MAX_ATTEMPTS:
                    await asyncio.sleep(_RETRY_BASE_DELAY * (2 ** (attempt - 1)))
                    continue
                break

    return {'choices': [{'message': {'content': _soft_error_msg(last_error)}}]}


def call_llm(
    messages: list[dict],
    tools: list[dict] | None = None,
    config_path: str | os.PathLike | None = None,
) -> dict:
    """Synchronous wrapper around the LLM call (for non-async callers).
    Uses blocking `time.sleep` for retries — prefer `call_llm_async` in
    async contexts (FastAPI routes, chat stream).
    """
    cfg = _load_config(config_path)
    url, api_key, body, _ = _build_body(messages, tools, cfg)

    last_error: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        LOG.info(
            'LLM call attempt=%d/%d provider=%s url=%s tools=%s rid=%s',
            attempt, _MAX_ATTEMPTS, cfg.get('provider'), url, bool(tools), get_request_id(),
        )
        try:
            r = httpx.post(
                url, json=body,
                headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
                timeout=_NONSTREAM_TIMEOUT,
            )
            if _handle_retryable(r.status_code, attempt, None):
                time.sleep(_RETRY_BASE_DELAY * (2 ** (attempt - 1)))
                continue
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            last_error = e
            LOG.error('LLM HTTP %d: %s', e.response.status_code, e.response.text[:200])
            break
        except httpx.RequestError as e:
            last_error = e
            LOG.warning('LLM request error attempt=%d: %s', attempt, e)
            if attempt < _MAX_ATTEMPTS:
                time.sleep(_RETRY_BASE_DELAY * (2 ** (attempt - 1)))
                continue
            break

    return {'choices': [{'message': {'content': _soft_error_msg(last_error)}}]}


async def stream_llm_text(
    messages: list[dict],
    config_path: str | os.PathLike | None = None,
) -> AsyncGenerator[str, None]:
    """Stream text deltas from the LLM provider. Yields raw text fragments.

    Reads the OpenAI-compatible SSE response, parses `data: {...}` lines,
    and yields each non-empty content delta. On HTTP failure (4xx/5xx) or
    network error, yields a single bracketed error fragment so the user
    sees the failure inline. Does NOT retry — by the time we get here the
    caller is mid-stream and a retry would duplicate output.
    """
    cfg = _load_config(config_path)
    provider, prov, url, model = _resolve(cfg)
    api_key = _api_key(cfg, provider, prov)

    body: dict[str, Any] = {
        'model': model,
        'messages': messages,
        'temperature': 0.3,
        'max_tokens': 4000,
        'stream': True,
    }
    if prov.get('extra_fields'):
        body.update(prov['extra_fields'])

    LOG.info('LLM stream provider=%s model=%s rid=%s',
             provider, model, get_request_id())

    try:
        async with httpx.AsyncClient() as client:
            async with client.stream(
                'POST',
                url,
                json=body,
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json',
                },
                timeout=_STREAM_TIMEOUT,
            ) as r:
                if r.status_code >= 400:
                    body_text = await r.aread()
                    LOG.error('LLM stream HTTP %d: %s',
                              r.status_code, body_text[:200].decode('utf-8', 'replace'))
                    yield (
                        f'\n\nLLM API error ({r.status_code}). '
                        'Please check your API key and model name in Configuration.'
                    )
                    return
                async for line in r.aiter_lines():
                    if not line.startswith('data: '):
                        continue
                    data = line[6:].strip()
                    if data == '[DONE]':
                        break
                    try:
                        obj = json.loads(data)
                        delta = obj.get('choices', [{}])[0].get('delta', {})
                        text = delta.get('content')
                        if text:
                            yield text
                    except (json.JSONDecodeError, IndexError, KeyError):
                        continue
    except httpx.RequestError as e:
        LOG.error('LLM stream request error: %s', e)
        yield ('\n\nUnable to reach the LLM API. '
               'Please check your network connection and API endpoint.')
