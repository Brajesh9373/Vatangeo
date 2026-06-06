import { useMemo, useState } from 'react';
import { FileText, ArrowLeft, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useHistory } from '../../context/HistoryContext';
import { useChat } from '../../context/ChatContext';
import ReceiptView from '../chat/ReceiptView';
import { formatINR, formatDateLong, relativeTime } from '../../lib/format';
import type { Message, QuoteReceipt } from '../../types';

interface ReceiptEntry {
  receipt: QuoteReceipt;
  sessionTitle: string;
  sessionId: string;
}

function isQuoteReceipt(x: unknown): x is QuoteReceipt {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.receipt_id === 'string' &&
    typeof r.issue_date === 'string' &&
    Array.isArray(r.line_items) &&
    typeof r.total === 'number'
  );
}

function extractReceipts(messages: Message[]): QuoteReceipt[] {
  const out: QuoteReceipt[] = [];
  for (const m of messages) {
    for (const tr of m.toolResults ?? []) {
      if (tr.tool === 'generate_quote' && isQuoteReceipt(tr.result)) {
        out.push(tr.result);
      }
    }
  }
  return out;
}

export default function ReceiptsView() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { sessions } = useHistory();
  const { state: chatState } = useChat();
  const [selected, setSelected] = useState<QuoteReceipt | null>(null);
  const [query, setQuery] = useState('');

  // Flatten all receipts across current session + saved sessions, deduped by receipt_id.
  const entries: ReceiptEntry[] = useMemo(() => {
    const seen = new Set<string>();
    const out: ReceiptEntry[] = [];

    for (const r of extractReceipts(chatState.messages)) {
      if (!seen.has(r.receipt_id)) {
        seen.add(r.receipt_id);
        out.push({ receipt: r, sessionTitle: 'Current session', sessionId: 'current' });
      }
    }
    for (const s of sessions) {
      for (const r of extractReceipts(s.messages)) {
        if (!seen.has(r.receipt_id)) {
          seen.add(r.receipt_id);
          out.push({ receipt: r, sessionTitle: s.title, sessionId: s.id });
        }
      }
    }
    out.sort((a, b) => b.receipt.generated_at - a.receipt.generated_at);
    return out;
  }, [chatState.messages, sessions]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter((e) => {
      const r = e.receipt;
      return (
        r.receipt_id.toLowerCase().includes(q) ||
        r.configuration.model.toLowerCase().includes(q) ||
        (r.customer.name?.toLowerCase().includes(q) ?? false) ||
        (r.customer.company?.toLowerCase().includes(q) ?? false) ||
        (r.customer.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [entries, query]);

  // ---- Detail view ----
  if (selected) {
    return (
      <div className={['flex-1 overflow-y-auto custom-scroll', isDark ? 'bg-[var(--color-dark-bg)]' : 'bg-[var(--color-light-bg)]'].join(' ')}>
        <div className="max-w-3xl mx-auto px-6 py-6">
          <button
            onClick={() => setSelected(null)}
            className={['inline-flex items-center gap-1.5 mb-4 text-xs font-medium transition-colors',
              isDark ? 'text-[var(--color-dark-muted)] hover:text-[var(--color-dark-text)]'
                     : 'text-[var(--color-light-muted)] hover:text-[var(--color-light-text)]'].join(' ')}
            type="button"
          >
            <ArrowLeft size={12} />
            Back to quotations
          </button>
          <ReceiptView receipt={selected} />
        </div>
      </div>
    );
  }

  // ---- List view ----
  const totalValue = entries.reduce((s, e) => s + e.receipt.total, 0);
  const containerCls = isDark ? 'bg-[var(--color-dark-bg)]' : 'bg-[var(--color-light-bg)]';
  const titleCls = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';
  const mutedCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';

  return (
    <div className={['flex-1 overflow-y-auto custom-scroll', containerCls].join(' ')}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className={['text-lg font-semibold', titleCls].join(' ')}>Quotations</h2>
            <p className={['text-xs mt-1', mutedCls].join(' ')}>
              All generated quotations across your conversations.
            </p>
          </div>
          {entries.length > 0 ? (
            <div className="text-right">
              <div className={['text-[10px] uppercase tracking-wider font-semibold', mutedCls].join(' ')}>
                Total value
              </div>
              <div className={['text-lg font-bold tabular-nums', titleCls].join(' ')}>
                {formatINR(totalValue)}
              </div>
            </div>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <EmptyState isDark={isDark} />
        ) : (
          <>
            <div className="mb-4 relative">
              <Search size={14} className={['absolute left-3 top-1/2 -translate-y-1/2', mutedCls].join(' ')} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by receipt ID, model, customer..."
                className={['w-full pl-9 pr-3 py-2 text-xs rounded-lg border outline-none transition-colors',
                  isDark
                    ? 'bg-[var(--color-dark-surface)] border-[var(--color-dark-border)] text-[var(--color-dark-text)] placeholder:text-[var(--color-dark-muted)] focus:border-[var(--color-brand)]'
                    : 'bg-[var(--color-light-elevated)] border-[var(--color-light-border)] text-[var(--color-light-text)] placeholder:text-[var(--color-placeholder)] focus:border-[var(--color-brand)]'].join(' ')}
              />
            </div>

            {filtered.length === 0 ? (
              <div className={['text-center py-12 text-sm', mutedCls].join(' ')}>
                No quotations match "{query}".
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map((e) => (
                  <ReceiptRow
                    key={e.receipt.receipt_id}
                    entry={e}
                    isDark={isDark}
                    onSelect={() => setSelected(e.receipt)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptRow({
  entry,
  isDark,
  onSelect,
}: {
  entry: ReceiptEntry;
  isDark: boolean;
  onSelect: () => void;
}) {
  const { receipt } = entry;
  const cardCls = [
    'group flex flex-col gap-2 p-4 rounded-xl border text-left transition-all cursor-pointer',
    'hover:shadow-md hover:border-[var(--color-brand)]',
    isDark
      ? 'bg-[var(--color-dark-surface)] border-[var(--color-dark-border)]'
      : 'bg-[var(--color-light-elevated)] border-[var(--color-light-border)] shadow-sm',
  ].join(' ');

  const labelCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  const textCls = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';

  return (
    <button onClick={onSelect} className={cardCls} type="button">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-[var(--color-brand)] shrink-0" />
          <span className={['text-xs font-mono font-semibold truncate', textCls].join(' ')}>
            {receipt.receipt_id}
          </span>
        </div>
        <span className={['shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded',
          isDark ? 'bg-[var(--color-dark-hover)] text-[var(--color-dark-muted)]'
                 : 'bg-[var(--color-accent-subtle)] text-[var(--color-light-muted)]'].join(' ')}>
          {receipt.status}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className={['text-sm font-semibold truncate', textCls].join(' ')}>
          {receipt.configuration.model}
        </span>
        <span className={['text-sm font-bold tabular-nums shrink-0', textCls].join(' ')}>
          {formatINR(receipt.total)}
        </span>
      </div>

      <div className={['text-[11px] flex items-center justify-between', labelCls].join(' ')}>
        <span>
          {receipt.customer.name || '—'}
          {receipt.customer.company ? ` · ${receipt.customer.company}` : ''}
        </span>
        <span>{relativeTime(receipt.generated_at * 1000)}</span>
      </div>

      <div className={['text-[10px] flex items-center justify-between pt-1 border-t',
        isDark ? 'border-[var(--color-dark-border)]' : 'border-[var(--color-light-border)]',
        labelCls].join(' ')}>
        <span>Qty {receipt.configuration.quantity} · {formatDateLong(receipt.issue_date)}</span>
        <span className="truncate max-w-[140px]" title={entry.sessionTitle}>
          from "{entry.sessionTitle}"
        </span>
      </div>
    </button>
  );
}

function EmptyState({ isDark }: { isDark: boolean }) {
  const mutedCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  const cardCls = isDark
    ? 'border-[var(--color-dark-border)] bg-[var(--color-dark-surface)]'
    : 'border-[var(--color-light-border)] bg-[var(--color-light-elevated)] shadow-sm';
  return (
    <div className={['rounded-xl border p-10 text-center', cardCls].join(' ')}>
      <FileText size={32} className={['mx-auto mb-3', mutedCls].join(' ')} />
      <h3 className={['text-sm font-semibold mb-1',
        isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
        No quotations yet
      </h3>
      <p className={['text-xs max-w-md mx-auto', mutedCls].join(' ')}>
        Click <span className="font-semibold text-[var(--color-brand)]">Get Quote</span> on any product
        in the catalog, or ask the chatbot for a quote like "I need a quote for the 2240-RG with 256GB RAM".
      </p>
    </div>
  );
}
