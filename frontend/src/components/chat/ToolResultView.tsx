import { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Server } from 'lucide-react';
import ReceiptView from './ReceiptView';
import type { QuoteReceipt } from '../../types';

interface Props {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

const BORDER = 'border-l-[3px] border-l-[var(--color-accent)]';
const LIGHT_BG = 'bg-[var(--color-light-surface)] border border-[var(--color-light-border)]';
const DARK_BG = 'bg-[var(--color-dark-hover)]';

export default function ToolResultView({ tool, args, result }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (result === null || result === undefined) return null;
  if (typeof result !== 'object') return null;

  const r = result as Record<string, unknown>;

  if ('error' in r && typeof r.error === 'string') {
    return <ErrorBlock message={r.error} isDark={isDark} />;
  }

  if (tool === 'generate_quote') {
    if (r.status === 'form_opened') {
      // The form is rendered as a separate chat element, not as a tool card.
      return null;
    }
    const receipt = isQuoteReceipt(r) ? r : null;
    if (!receipt) return null;
    return <ReceiptView receipt={receipt} />;
  }

  if (tool === 'get_product_spec') {
    // Spec data is presented in the assistant's prose reply — rendering the
    // raw dict here would duplicate it. Show a compact badge so the user
    // knows the lookup happened, but keep the actual values out of the UI.
    const model = typeof r.model === 'string' ? String(r.model).replace(/^Vantageo\s+/, '') : null;
    return (
      <div className={['mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium max-w-fit',
        isDark ? 'bg-[var(--color-dark-hover)] text-[var(--color-dark-muted)]'
               : 'bg-[var(--color-light-elevated)] text-[var(--color-light-muted)] border border-[var(--color-light-border)]'].join(' ')}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-brand)]" />
        {model ? `Loaded spec · ${model}` : 'Loaded spec'}
      </div>
    );
  }

  if (tool === 'compare_products') {
    return <CompareBlock data={r} isDark={isDark} />;
  }

  if (tool === 'list_products' || tool === 'find_by_requirement') {
    return <ProductList data={r} isDark={isDark} />;
  }

  return null;
}

function Header({ label, isDark }: { label: string; isDark: boolean }) {
  return (
    <div className={['px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b',
      isDark ? 'border-[var(--color-dark-border)] text-[var(--color-dark-muted)]'
             : 'border-[var(--color-light-border)] text-[var(--color-light-muted)]'].join(' ')}>
      {label}
    </div>
  );
}

function ErrorBlock({ message, isDark }: { message: string; isDark: boolean }) {
  return (
    <div className={['mt-1 px-3 py-2 rounded-lg text-xs border max-w-[600px]',
      isDark ? 'border-[var(--color-error)]/30 bg-[var(--color-error-subtle)] text-[var(--color-error)]'
             : 'border-[var(--color-error)]/30 bg-[var(--color-error-subtle)] text-[var(--color-error)]'].join(' ')}>
      {message}
    </div>
  );
}

function CompareBlock({ data, isDark }: { data: Record<string, unknown>; isDark: boolean }) {
  const products = Object.keys(data);
  if (products.length === 0) return null;

  const allKeys = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) {
      const spec = data[p];
      if (spec && typeof spec === 'object') {
        for (const k of Object.keys(spec as Record<string, unknown>)) {
          if (!k.startsWith('_')) s.add(k);
        }
      }
    }
    return Array.from(s);
  }, [data, products]);

  return (
    <div className={['mt-1 rounded-r-lg overflow-hidden max-w-full', BORDER, isDark ? DARK_BG : LIGHT_BG].join(' ')}>
      <Header label={`Comparing ${products.length} products`} isDark={isDark} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className={isDark ? 'border-b border-[var(--color-dark-border)]' : 'border-b border-[var(--color-light-border)]'}>
              <th className={['text-left py-1.5 px-3 font-semibold w-32',
                isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
                Spec
              </th>
              {products.map((p) => (
                <th key={p} className="text-left py-1.5 px-3 font-semibold text-[var(--color-brand)] whitespace-nowrap">
                  {p.replace(/^Vantageo\s+/, '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allKeys.map((key) => (
              <tr key={key} className={isDark ? 'border-b border-[var(--color-dark-border)]' : 'border-b border-[var(--color-light-border)]'}>
                <td className={['py-1.5 px-3 font-medium whitespace-nowrap',
                  isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
                  {key.replace(/_/g, ' ')}
                </td>
                {products.map((p) => {
                  const spec = data[p] as Record<string, unknown> | undefined;
                  const val = spec?.[key];
                  const display = formatCell(val);
                  return (
                    <td key={p} className={['py-1.5 px-3 whitespace-pre-wrap',
                      isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductList({ data, isDark }: { data: unknown; isDark: boolean }) {
  let entries: Array<{ model: string; info: Record<string, unknown> }>;

  if (Array.isArray(data)) {
    entries = data
      .filter((d): d is Record<string, unknown> => d !== null && typeof d === 'object')
      .map((d) => ({ model: String(d.model ?? d.product ?? '?'), info: d }));
  } else if (data && typeof data === 'object') {
    entries = Object.entries(data as Record<string, unknown>)
      .filter(([, v]) => v && typeof v === 'object' && !('error' in (v as Record<string, unknown>)))
      .map(([k, v]) => ({ model: k, info: v as Record<string, unknown> }));
  } else {
    return null;
  }

  if (entries.length === 0) return null;

  return (
    <div className={['mt-1 rounded-r-lg overflow-hidden max-w-[600px]', BORDER, isDark ? DARK_BG : LIGHT_BG].join(' ')}>
      <Header label={`${entries.length} product${entries.length === 1 ? '' : 's'}`} isDark={isDark} />
      <div className="p-2 flex flex-col gap-1.5">
        {entries.map(({ model, info }) => (
          <div key={model} className={['flex items-center gap-2 px-2 py-1.5 rounded-md',
            isDark ? 'bg-[var(--color-dark-surface)]' : 'bg-[var(--color-light-elevated)] border border-[var(--color-light-border)]'].join(' ')}>
            <Server size={12} className="text-[var(--color-brand)] shrink-0" />
            <span className={['text-xs font-semibold whitespace-nowrap',
              isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
              {model.replace(/^Vantageo\s+/, '')}
            </span>
            <span className={['text-[10px] truncate',
              isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
              {summarize(info)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function summarize(info: Record<string, unknown>): string {
  const parts: string[] = [];
  if (info.form_factor) parts.push(String(info.form_factor));
  if (info.ff_detail) parts.push(String(info.ff_detail));
  if (info.dimm_slots) parts.push(`${info.dimm_slots} DIMMs`);
  if (info.memory_type) parts.push(String(info.memory_type));
  if (info.max_tdp_w) parts.push(`${info.max_tdp_w}W TDP`);
  return parts.join(' · ');
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      if (val.length === 0) return '-';
      return val.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
    }
    const entries = Object.entries(val as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (entries.length === 0) return '-';
    return entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('\n');
  }
  return String(val);
}

function formatToolLabel(tool: string, args: Record<string, unknown>): string {
  if (tool === 'get_product_spec') {
    const m = args.model;
    return m ? `Specifications — ${String(m)}` : 'Specifications';
  }
  if (tool === 'compare_products') {
    const ps = args.products;
    if (Array.isArray(ps)) return `Comparison — ${ps.join(' vs ')}`;
  }
  if (tool === 'list_products') return 'Product catalog';
  if (tool === 'find_by_requirement') return 'Matching products';
  if (tool === 'generate_quote') return 'Quotation';
  return tool;
}

function isQuoteReceipt(x: unknown): x is QuoteReceipt {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.receipt_id === 'string' &&
    typeof r.issue_date === 'string' &&
    typeof r.line_items === 'object' &&
    Array.isArray(r.line_items) &&
    typeof r.total === 'number' &&
    typeof r.issuer === 'object' &&
    typeof r.customer === 'object'
  );
}
