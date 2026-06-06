"""Structured logging with request ID propagation.

The `request_id` contextvar is set by the request middleware in app.py and
read by log filters so every log line in a request's lifetime carries the
same correlation ID. Set the VANTAGEO_LOG_JSON=1 environment variable to
emit JSON log lines (for log aggregators); otherwise we emit a human-readable
format.
"""
import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Any

_request_id: ContextVar[str] = ContextVar('request_id', default='-')


def set_request_id(rid: str | None = None) -> str:
    """Set the request ID for the current async context. Generates a new
    short hex ID if none provided. Returns the active ID."""
    if not rid:
        rid = uuid.uuid4().hex[:12]
    _request_id.set(rid)
    return rid


def get_request_id() -> str:
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get()
        return True


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            'ts': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(record.created))
                  + f'.{int(record.msecs):03d}Z',
            'level': record.levelname,
            'logger': record.name,
            'msg': record.getMessage(),
            'rid': getattr(record, 'request_id', '-'),
        }
        if record.exc_info:
            payload['exc'] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = 'INFO', json_output: bool = False) -> None:
    """Configure the root logger. Idempotent — clears existing handlers
    before installing ours so repeated calls (e.g. under reload=True) don't
    duplicate output."""
    root = logging.getLogger()
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    if json_output:
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            '%(asctime)s [%(levelname)s] [%(request_id)s] %(name)s: %(message)s',
            datefmt='%H:%M:%S',
        ))
    handler.addFilter(RequestIdFilter())
    root.addHandler(handler)
    root.setLevel(level)
    # Tame the noisy third-party loggers
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
