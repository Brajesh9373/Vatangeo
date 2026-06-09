"""
Vantageo Chatbot Backend — FastAPI with LLM tools and product data.
config.json (or env vars) controls: provider ("nvidia" | "commandcode"),
api_key, model.

This file is intentionally thin: LLM client, tool registry, and logging
live in `lib/`. What stays here is process setup (lifespan, middleware,
CORS, static mount) and the HTTP routes that bind them together.

Deployment
----------
* Local dev: reads `../config.json` (parent of repo) or env vars
* Render / stateless: relies entirely on env vars (no filesystem persistence)

The data backend is auto-selected: FalkorDB if reachable, otherwise
`json_formate/*.json` (see `lib/graph_queries.py`).
"""

import json
import os
import uuid
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from lib.graph_queries import tool_compare, tool_list_models
from lib.llm import DEFAULT_PROVIDER, call_llm_async, stream_llm_text
from lib.logging_setup import (
    get_request_id,
    set_request_id,
    setup_logging,
)
from lib.pricing import calculate_quote
from lib.tools import SYSTEM_PROMPT, TOOL_DEFINITIONS, resolve_tool

# ---------- CONFIG ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(BASE_DIR, "frontend")
REACT_DIST = os.path.join(FRONTEND, "dist")

# Config lookup order: env override → in-repo → parent of repo (legacy).
# This works on Render (env vars / in-repo fallback) and on the user's
# local machine (parent-of-repo D:\firm\config.json).
_CONFIG_CANDIDATES = [
    os.environ.get("VANTAGEO_CONFIG_PATH"),
    os.path.join(BASE_DIR, "config.json"),
    os.path.join(os.path.dirname(BASE_DIR), "config.json"),
]
CONFIG_PATH = next(
    (p for p in _CONFIG_CANDIDATES if p and os.path.exists(p)),
    _CONFIG_CANDIDATES[1],  # default: in-repo path (writable on Render)
)

LOG = logging.getLogger("vantageo")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """One-time startup: log config + backend, ping data source if it's
    FalkorDB. The app still serves when the data source is unhealthy —
    /api/chat will fail on the first tool call and /api/health returns
    503 until the data source comes back."""
    setup_logging()
    LOG.info("Starting Vantageo chatbot — config=%s port=%s",
             CONFIG_PATH, os.environ.get("PORT", "8000"))
    try:
        from lib.graph_queries import DB
        if DB is not None:
            DB.select_graph("vantageo").query("RETURN 1 AS ok")
            LOG.info("FalkorDB reachable — graph 'vantageo' OK")
        else:
            LOG.info("Using JSON backend (no FalkorDB connection)")
    except Exception:
        LOG.exception("FalkorDB unreachable at startup — chat will fail until it comes back")
    yield


APP = FastAPI(title="Vantageo Chatbot", lifespan=lifespan)

# CORS — default to wildcard for local dev; override in prod via CORS_ORIGINS.
_cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
APP.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- REQUEST-ID MIDDLEWARE ----------

@APP.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Set a request ID from the incoming `X-Request-ID` header (or mint one)
    so every log line emitted while handling this request carries the same
    correlation token. Echo the ID back to the client."""
    rid = request.headers.get("x-request-id") or str(uuid.uuid4())
    set_request_id(rid)
    try:
        response = await call_next(request)
    except Exception:
        LOG.exception("Unhandled error — request_id=%s %s %s", rid, request.method, request.url.path)
        return JSONResponse(
            {"error": "internal server error", "request_id": rid},
            status_code=500,
        )
    response.headers["X-Request-ID"] = rid
    return response


# ---------- CONFIG PERSISTENCE ----------

def load_config() -> dict:
    """Read LLM config. Order of precedence:
    1. `VANTAGEO_CONFIG_PATH` (if set and readable)
    2. `<repo>/config.json` — the in-repo path; works on Render.
    3. `<parent of repo>/config.json` — legacy local dev (D:\\firm\\config.json).
    4. Environment variables (NVIDIA_API_KEY / OPENAI_API_KEY / CC_LLM_API_KEY).
    5. Hardcoded defaults.
    """
    for path in _CONFIG_CANDIDATES:
        if not path or not os.path.exists(path):
            continue
        try:
            with open(path, "r") as f:
                cfg = json.load(f)
            return cfg
        except (OSError, json.JSONDecodeError) as e:
            LOG.warning("Config at %s unreadable: %s — falling back to env", path, e)
            break
    provider = os.environ.get("VANTAGEO_LLM_PROVIDER", DEFAULT_PROVIDER)
    model = os.environ.get("VANTAGEO_LLM_MODEL", "")
    api_key = os.environ.get(
        "NVIDIA_API_KEY" if provider == "nvidia" else "OPENAI_API_KEY", ""
    )
    if provider == "commandcode" and not api_key:
        api_key = os.environ.get("CC_LLM_API_KEY", "")
    endpoint = os.environ.get("CC_LLM_ENDPOINT", "")
    return {
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "endpoint": endpoint,
    }


# ---------- CHAT ROUTE ----------

class ChatRequest(BaseModel):
    messages: list[dict]


def _ndjson(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, default=str) + "\n").encode("utf-8")


async def _stream_chat(messages_in: list[dict], request_id: str) -> AsyncGenerator[bytes, None]:
    """Stream the chat response as newline-delimited JSON events.

    Event types:
      {"type": "text", "text": "..."}       — LLM token fragment
      {"type": "tool_result", "name": "...", "args": {...}, "result": {...}}
                                            — a tool call resolved; frontend renders as spec card
      {"type": "done"}                       — stream complete
      {"type": "error", "message": "..."}   — fatal error

    The first LLM call is non-streaming (we need the full tool_calls payload).
    If there are tool calls, resolve them and stream the second LLM call
    token-by-token. If there are no tool calls, the first call's text is
    emitted as a single text event.
    """
    try:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages_in

        resp = await call_llm_async(messages, TOOL_DEFINITIONS, CONFIG_PATH)
        choice = resp.get("choices", [{}])[0]
        msg = choice.get("message", {})

        tool_calls = msg.get("tool_calls", [])

        if not tool_calls:
            text = msg.get("content", "")
            if text:
                yield _ndjson({"type": "text", "text": text, "request_id": request_id})
            yield _ndjson({"type": "done", "request_id": request_id})
            return

        messages.append(msg)
        for tc in tool_calls:
            fn_name = tc["function"]["name"]
            try:
                fn_args = json.loads(tc["function"]["arguments"])
            except json.JSONDecodeError:
                fn_args = {}
            LOG.info("Tool call: %s args=%s", fn_name, fn_args)

            result = resolve_tool(fn_name, fn_args)
            yield _ndjson({
                "type": "tool_result",
                "name": fn_name,
                "args": fn_args,
                "result": result,
                "request_id": request_id,
            })

            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })

        async for text in stream_llm_text(messages, CONFIG_PATH):
            yield _ndjson({"type": "text", "text": text, "request_id": request_id})

        yield _ndjson({"type": "done", "request_id": request_id})
    except Exception as e:
        LOG.exception("Chat stream error")
        yield _ndjson({"type": "error", "message": str(e), "request_id": request_id})
        yield _ndjson({"type": "done", "request_id": request_id})


@APP.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    rid = get_request_id() or str(uuid.uuid4())
    return StreamingResponse(
        _stream_chat(req.messages, rid),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------- CONFIG ENDPOINTS ----------

class ConfigUpdate(BaseModel):
    provider: str = DEFAULT_PROVIDER
    api_key: str | None = None
    model: str | None = None
    endpoint: str | None = None


@APP.get("/api/config")
async def get_config():
    cfg = load_config()
    # Never expose the full API key
    safe = dict(cfg)
    if safe.get("api_key"):
        safe["api_key"] = safe["api_key"][:4] + "••••" + safe["api_key"][-4:]
    return safe


@APP.post("/api/config")
async def update_config(cfg: ConfigUpdate):
    config = load_config()
    if cfg.provider:
        config["provider"] = cfg.provider
    if cfg.api_key is not None and cfg.api_key.strip():
        config["api_key"] = cfg.api_key
    if cfg.model is not None and cfg.model.strip():
        config["model"] = cfg.model
    if cfg.endpoint is not None and cfg.endpoint.strip():
        config["endpoint"] = cfg.endpoint
    # Persist to disk if possible. On Render the filesystem is ephemeral
    # so writes are best-effort; the UI's session sees the update either
    # way (load_config is called per request).
    try:
        os.makedirs(os.path.dirname(CONFIG_PATH) or ".", exist_ok=True)
        with open(CONFIG_PATH, "w") as f:
            json.dump(config, f, indent=2)
    except OSError as e:
        LOG.warning("Could not persist config to %s: %s (session-only change)", CONFIG_PATH, e)
    LOG.info("Config updated: provider=%s model=%s", config.get("provider"), config.get("model"))
    return {"status": "ok", "config": config}


# ---------- CATALOG & COMPARE ENDPOINTS ----------

@APP.get("/api/products")
async def get_products():
    """Return all Vantageo product models with basic specs."""
    products = tool_list_models()
    return {"products": products}


@APP.post("/api/products/compare")
async def compare_products(req: dict):
    """Compare specs of given products side-by-side."""
    products = req.get("products", [])
    if not products:
        return {"error": "No products specified"}
    result = tool_compare(products)
    return {"comparison": result}


# ---------- QUOTE ENDPOINT ----------

class QuoteRequest(BaseModel):
    model: str
    quantity: int = 1
    memory_gb: int = 0
    storage_gb: int = 0
    gpu_count: int = 0
    use_case: str | None = None
    customer: dict[str, str | None] | None = None


@APP.post("/api/quote")
async def post_quote(req: QuoteRequest):
    """Generate a fully-priced quote receipt from the user's configuration.

    Pricing + BOM derivation live in `lib/pricing.calculate_quote`. The LLM
    never touches this path — the frontend POSTs here directly when the
    user submits the quote form. See `lib/pricing.py` for the BOM rules and
    the cap behavior.
    """
    try:
        receipt = calculate_quote(
            model=req.model,
            quantity=req.quantity,
            memory_gb=req.memory_gb,
            storage_gb=req.storage_gb,
            gpu_count=req.gpu_count,
            customer=req.customer,
            use_case=req.use_case,
        )
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    LOG.info(
        "Quote generated: id=%s model=%s qty=%d total=%d",
        receipt["receipt_id"], req.model, req.quantity, receipt["total"],
    )
    return receipt


class QuotePreviewRequest(BaseModel):
    model: str
    quantity: int = 1
    memory_gb: int = 0
    storage_gb: int = 0
    gpu_count: int = 0


@APP.get("/api/quote/limits")
async def get_quote_limits(model: str):
    """Return the maximum configurable capacity for a given model, sourced
    from `lib.pricing.MAX_CONFIG`. The quote form uses this to pre-fill
    sensible defaults, label each field with its cap (e.g. "max 1024 GB"),
    and disable the GPU field on models that don't support GPUs.
    """
    from lib.pricing import MAX_CONFIG
    if not model:
        return JSONResponse({"error": "model query param is required"}, status_code=400)
    canonical = "Vantageo " + model if not model.startswith("Vantageo ") else model
    cfg = MAX_CONFIG.get(canonical)
    if not cfg:
        return JSONResponse({"error": f"Unknown model: {model}"}, status_code=404)
    return {
        "model": canonical,
        "form_factor": cfg.get("form_factor"),
        "max_memory_gb": cfg["max_dimm"] * 32,
        "max_storage_gb": cfg["max_drive"] * 1000,
        "max_gpu": 2 if cfg.get("gpu_supported") else 0,
        "gpu_supported": bool(cfg.get("gpu_supported")),
        "default_dimm_gb": cfg.get("default_dimm_gb", 0),
        "default_drive_gb": cfg.get("default_drive_gb", 0),
    }


@APP.post("/api/quote/preview")
async def post_quote_preview(req: QuotePreviewRequest):
    """Lightweight price preview for the live quote form. Same calculation
    engine as /api/quote but no customer info required and no receipt ID
    generated — designed for fast, repeated calls as the user edits the
    form. Returns just the math (per-unit, subtotal, tax, total) plus any
    cap notes the engine emitted.
    """
    try:
        receipt = calculate_quote(
            model=req.model,
            quantity=req.quantity,
            memory_gb=req.memory_gb,
            storage_gb=req.storage_gb,
            gpu_count=req.gpu_count,
            customer=None,
        )
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    qty = max(1, req.quantity)
    per_unit = receipt["subtotal"] // qty
    return {
        "per_unit": per_unit,
        "subtotal": receipt["subtotal"],
        "tax_amount": receipt["tax_amount"],
        "total": receipt["total"],
        "currency": receipt["currency"],
        "notes": receipt.get("notes", []),
    }


# ---------- HEALTH ----------

@APP.get("/api/health")
async def health():
    """Liveness + dependency check. Returns 200 if all deps look healthy,
    503 if any check fails. Used by frontend's connection test and any
    external uptime monitor."""
    checks: dict = {}

    # Data backend (FalkorDB or JSON)
    try:
        from lib.graph_queries import DB, _USE_JSON  # type: ignore
        if _USE_JSON:
            products = tool_list_models()
            if not products:
                raise RuntimeError("JSON backend returned no products")
            checks["data_backend"] = "ok"
            checks["data_backend_type"] = "json"
        else:
            DB.select_graph("vantageo").query("RETURN 1 AS ok")
            checks["data_backend"] = "ok"
            checks["data_backend_type"] = "falkordb"
    except Exception as e:
        checks["data_backend"] = f"error: {type(e).__name__}: {e}"

    # LLM config presence
    cfg = load_config()
    provider = cfg.get("provider", DEFAULT_PROVIDER)
    prov_cfg = (provider or "").lower()
    api_key = cfg.get("api_key") or os.environ.get(
        "NVIDIA_API_KEY" if prov_cfg == "nvidia" else "OPENAI_API_KEY", ""
    )
    if prov_cfg == "commandcode" and not api_key:
        api_key = os.environ.get("CC_LLM_API_KEY", "")
    checks["llm"] = "ok" if api_key else "error: no api_key configured"
    checks["llm_provider"] = prov_cfg
    checks["llm_model"] = cfg.get("model", "")

    healthy = all(
        v == "ok" or v.startswith("ok")
        for k, v in checks.items()
        if k.startswith(("data_backend", "llm"))
    )
    return JSONResponse(
        {
            "status": "healthy" if healthy else "degraded",
            "checks": checks,
            "request_id": get_request_id(),
        },
        status_code=200 if healthy else 503,
    )


# ---------- STATIC FRONTEND ----------

os.makedirs(FRONTEND, exist_ok=True)
if os.path.isdir(REACT_DIST):
    # Mount the entire build output at root so `/logo.webp`, `/favicon.ico`,
    # and any other top-level files in `public/` are served. `html=True`
    # makes Starlette serve `index.html` for `/` and fall back to it for
    # any unknown path (SPA routing — our app uses useState, not URL
    # routes, so this fallback is benign). API routes are registered
    # above this mount and take precedence for `/api/...` paths.
    APP.mount("/", StaticFiles(directory=REACT_DIST, html=True), name="frontend")


# ---------- RUN ----------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    reload = os.environ.get("VANTAGEO_RELOAD", "").lower() in ("1", "true", "yes")
    uvicorn.run("app:APP", host="0.0.0.0", port=port, reload=reload)
