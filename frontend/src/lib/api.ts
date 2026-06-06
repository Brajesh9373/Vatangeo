import {
  type AppConfig,
  type ConfigState,
  type CatalogProduct,
  type QuoteReceipt,
  type QuotePreview,
  type QuotePreviewRequest,
  type QuoteLimits,
  type QuoteFormSubmitPayload,
} from '../types';

const API_BASE = '/api';

export async function fetchConfig(): Promise<AppConfig> {
  const r = await fetch(`${API_BASE}/config`);
  if (!r.ok) throw new Error(`Config fetch failed: ${r.status}`);
  return r.json();
}

export async function saveConfig(cfg: Partial<AppConfig>): Promise<{ status: string; config: AppConfig }> {
  const r = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) throw new Error(`Config save failed: ${r.status}`);
  return r.json();
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_result'; name: string; args: Record<string, unknown>; result: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Stream a chat response from the backend. The backend returns
 * application/x-ndjson with one JSON event per line. We accumulate
 * partial chunks until we see a newline, parse each line, and dispatch
 * it to `onEvent`. Throws if the initial POST fails; otherwise the
 * connection is left in the caller's hands (call `signal.abort()` to
 * cancel mid-stream).
 */
export async function streamChat(
  messages: { role: string; content: string }[],
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const r = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `Chat API error: ${r.status}`);
  }
  if (!r.body) {
    throw new Error('No response body from chat API');
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.trim()) {
          try {
            onEvent(JSON.parse(line) as ChatEvent);
          } catch {
            // Malformed line — skip silently. The backend never emits invalid JSON.
          }
        }
        nl = buffer.indexOf('\n');
      }
    }
    if (buffer.trim()) {
      try {
        onEvent(JSON.parse(buffer) as ChatEvent);
      } catch {
        // Trailing buffer wasn't valid JSON; ignore.
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function fetchProducts(): Promise<CatalogProduct[]> {
  const r = await fetch(`${API_BASE}/products`);
  if (!r.ok) throw new Error(`Products fetch failed: ${r.status}`);
  const data = await r.json();
  return data.products ?? [];
}

export async function fetchCompare(products: string[]): Promise<Record<string, Record<string, unknown>>> {
  const r = await fetch(`${API_BASE}/products/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ products }),
  });
  if (!r.ok) throw new Error(`Compare fetch failed: ${r.status}`);
  const data = await r.json();
  return (data.comparison ?? {}) as Record<string, Record<string, unknown>>;
}

export async function testConnection(cfg: ConfigState): Promise<boolean> {
  try {
    const savePayload: Partial<AppConfig> = {
      provider: cfg.provider,
      model: cfg.modelName,
      api_key: cfg.apiKey,
    };
    if (cfg.endpoint) savePayload.endpoint = cfg.endpoint;
    await saveConfig(savePayload);
    const r = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function fetchQuote(payload: QuoteFormSubmitPayload): Promise<QuoteReceipt> {
  const r = await fetch(`${API_BASE}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `Quote API error: ${r.status}`);
  }
  return r.json() as Promise<QuoteReceipt>;
}

export async function fetchQuotePreview(req: QuotePreviewRequest): Promise<QuotePreview> {
  const r = await fetch(`${API_BASE}/quote/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `Quote preview failed: ${r.status}`);
  }
  return r.json() as Promise<QuotePreview>;
}

export async function fetchQuoteLimits(model: string): Promise<QuoteLimits> {
  const r = await fetch(`${API_BASE}/quote/limits?model=${encodeURIComponent(model)}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `Quote limits failed: ${r.status}`);
  }
  return r.json() as Promise<QuoteLimits>;
}
