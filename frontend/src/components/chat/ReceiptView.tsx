import { useCallback } from 'react';
import { Printer, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { formatINR, formatDateLong } from '../../lib/format';
import type { QuoteReceipt } from '../../types';

interface Props {
  receipt: QuoteReceipt;
}

const BORDER = 'border-l-[3px] border-l-[var(--color-brand)]';
const LIGHT_BG = 'bg-[var(--color-light-elevated)] border border-[var(--color-light-border)]';
const DARK_BG = 'bg-[var(--color-dark-surface)] border border-[var(--color-dark-border)]';

export default function ReceiptView({ receipt }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [copied, setCopied] = useState(false);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleCopy = useCallback(() => {
    const text = receiptToText(receipt);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      // Clipboard API unavailable (insecure context); silently ignore.
    });
  }, [receipt]);

  const muted = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  const text = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';
  const subtext = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-text-soft)]';
  const headerBg = isDark ? 'bg-[var(--color-dark-bg)]' : 'bg-[var(--color-light-bg)]';
  const tableBorder = isDark ? 'border-[var(--color-dark-border)]' : 'border-[var(--color-light-border)]';
  const tableStriped = isDark ? 'bg-[var(--color-dark-bg)]/40' : 'bg-[var(--color-light-surface)]/40';

  return (
    <div
      id="vantageo-receipt"
      className={['mt-1 rounded-r-lg overflow-hidden max-w-[640px] receipt-card', BORDER, isDark ? DARK_BG : LIGHT_BG].join(' ')}
    >
      {/* Header */}
      <div className={['px-5 py-4 border-b flex items-start justify-between', tableBorder, headerBg].join(' ')}>
        <div>
          <div className={['text-sm font-semibold tracking-wide', text].join(' ')}>
            {receipt.issuer.name.toUpperCase()}
          </div>
          <div className={['text-[10px] mt-0.5', muted].join(' ')}>
            {receipt.issuer.tagline}
          </div>
          <div className={['text-[10px] mt-1', subtext].join(' ')}>
            {receipt.issuer.address} · {receipt.issuer.email}
          </div>
          <div className={['text-[10px]', subtext].join(' ')}>
            GSTIN: {receipt.issuer.gstin}
          </div>
        </div>
        <div className="text-right">
          <div className={['text-base font-bold tracking-[0.2em]', text].join(' ')}>
            QUOTATION
          </div>
          <div className={['text-[10px] mt-2', muted].join(' ')}>
            Quote ID
          </div>
          <div className={['text-xs font-mono font-semibold', text].join(' ')}>
            {receipt.receipt_id}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="px-5 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] border-b" style={{ borderColor: 'var(--color-light-border)' }}>
        <div>
          <div className={['uppercase tracking-wider text-[9px]', muted].join(' ')}>Issue Date</div>
          <div className={['font-medium mt-0.5', text].join(' ')}>{formatDateLong(receipt.issue_date)}</div>
        </div>
        <div>
          <div className={['uppercase tracking-wider text-[9px]', muted].join(' ')}>Valid Until</div>
          <div className={['font-medium mt-0.5', text].join(' ')}>{formatDateLong(receipt.valid_until)}</div>
        </div>
        <div>
          <div className={['uppercase tracking-wider text-[9px]', muted].join(' ')}>Status</div>
          <div className={['font-medium mt-0.5 inline-block px-1.5 py-0.5 rounded text-[10px]',
            'bg-[var(--color-brand)]/10 text-[var(--color-brand)]'].join(' ')}>
            {receipt.status}
          </div>
        </div>
        <div>
          <div className={['uppercase tracking-wider text-[9px]', muted].join(' ')}>Currency</div>
          <div className={['font-medium mt-0.5', text].join(' ')}>INR (₹)</div>
        </div>
      </div>

      {/* Customer + Prepared-by */}
      <div className={['px-5 py-3 grid grid-cols-2 gap-4 border-b text-[11px]', tableBorder].join(' ')}>
        <div>
          <div className={['uppercase tracking-wider text-[9px] font-semibold mb-1', muted].join(' ')}>
            Bill To
          </div>
          {receipt.customer.name ? (
            <div className={['font-medium', text].join(' ')}>{receipt.customer.name}</div>
          ) : (
            <div className={['italic', muted].join(' ')}>Customer name</div>
          )}
          {receipt.customer.company ? (
            <div className={subtext}>{receipt.customer.company}</div>
          ) : null}
          {receipt.customer.email ? (
            <div className={subtext}>{receipt.customer.email}</div>
          ) : null}
          {receipt.customer.phone ? (
            <div className={subtext}>{receipt.customer.phone}</div>
          ) : null}
        </div>
        <div>
          <div className={['uppercase tracking-wider text-[9px] font-semibold mb-1', muted].join(' ')}>
            Prepared By
          </div>
          <div className={['font-medium', text].join(' ')}>Vantageo Sales</div>
          <div className={subtext}>{receipt.issuer.email}</div>
          <div className={subtext}>{receipt.issuer.phone}</div>
        </div>
      </div>

      {/* Configuration summary */}
      <div className={['px-5 py-3 border-b text-[11px]', tableBorder].join(' ')}>
        <div className={['uppercase tracking-wider text-[9px] font-semibold mb-2', muted].join(' ')}>
          Configuration
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div>
            <span className={muted}>Product: </span>
            <span className={['font-medium', text].join(' ')}>{receipt.configuration.model}</span>
          </div>
          <div>
            <span className={muted}>Form Factor: </span>
            <span className={text}>{receipt.configuration.form_factor}</span>
          </div>
          <div>
            <span className={muted}>Quantity: </span>
            <span className={text}>{receipt.configuration.quantity} unit{receipt.configuration.quantity === 1 ? '' : 's'}</span>
          </div>
          {receipt.configuration.use_case ? (
            <div>
              <span className={muted}>Use Case: </span>
              <span className={text}>{receipt.configuration.use_case}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* BOM table */}
      <div className="px-5 py-3">
        <div className={['uppercase tracking-wider text-[9px] font-semibold mb-2', muted].join(' ')}>
          Bill of Materials
        </div>
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className={['border-b', tableBorder].join(' ')}>
              <th className={['text-left py-1.5 font-semibold uppercase tracking-wider text-[9px]', muted].join(' ')}>SKU</th>
              <th className={['text-left py-1.5 font-semibold uppercase tracking-wider text-[9px]', muted].join(' ')}>Description</th>
              <th className={['text-right py-1.5 font-semibold uppercase tracking-wider text-[9px]', muted].join(' ')}>Qty</th>
              <th className={['text-right py-1.5 font-semibold uppercase tracking-wider text-[9px]', muted].join(' ')}>Unit</th>
              <th className={['text-right py-1.5 font-semibold uppercase tracking-wider text-[9px]', muted].join(' ')}>Total</th>
            </tr>
          </thead>
          <tbody>
            {receipt.line_items.map((li, i) => (
              <tr
                key={li.sku}
                className={['border-b', tableBorder, i % 2 === 1 ? tableStriped : ''].join(' ')}
              >
                <td className={['py-1.5 pr-2 font-mono text-[10px]', text].join(' ')}>{li.sku}</td>
                <td className={['py-1.5 pr-2', text].join(' ')}>{li.description}</td>
                <td className={['py-1.5 text-right', text].join(' ')}>{li.quantity}</td>
                <td className={['py-1.5 text-right', text].join(' ')}>{formatINR(li.unit_price)}</td>
                <td className={['py-1.5 text-right font-medium', text].join(' ')}>{formatINR(li.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Notes (cap messages) */}
        {receipt.notes && receipt.notes.length > 0 ? (
          <div className={['mt-3 px-2.5 py-2 rounded text-[10px] leading-relaxed',
            isDark
              ? 'bg-[var(--color-dark-hover)] text-[var(--color-dark-muted)]'
              : 'bg-[var(--color-brand-subtle)] text-[var(--color-light-text-soft)] border border-[var(--color-brand-muted)]'].join(' ')}>
            <div className="font-semibold mb-1 uppercase tracking-wider text-[9px]">Notes</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {receipt.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        ) : null}

        {/* Totals */}
        <div className="mt-3 ml-auto max-w-[260px] text-[11px]">
          <div className={['flex justify-between py-1', text].join(' ')}>
            <span className={muted}>Subtotal</span>
            <span className="tabular-nums">{formatINR(receipt.subtotal)}</span>
          </div>
          <div className={['flex justify-between py-1 border-t', tableBorder, text].join(' ')}>
            <span className={muted}>{receipt.tax_label}</span>
            <span className="tabular-nums">{formatINR(receipt.tax_amount)}</span>
          </div>
          <div className={['flex justify-between py-2 mt-1 border-t-2 font-bold text-sm', tableBorder, text].join(' ')}>
            <span>TOTAL</span>
            <span className="tabular-nums">{formatINR(receipt.total)}</span>
          </div>
        </div>
      </div>

      {/* Terms */}
      <div className={['px-5 py-3 border-t text-[10px] leading-relaxed', tableBorder, subtext].join(' ')}>
        <div className={['uppercase tracking-wider text-[9px] font-semibold mb-1.5', muted].join(' ')}>
          Terms & Conditions
        </div>
        <ol className="list-decimal pl-4 space-y-0.5">
          {receipt.terms.map((t, i) => <li key={i}>{t}</li>)}
        </ol>
      </div>

      {/* Actions (hidden on print) */}
      <div className="no-print px-5 py-2.5 flex items-center gap-2 justify-end border-t" style={{ borderColor: 'var(--color-light-border)' }}>
        <button
          onClick={handleCopy}
          className={['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors',
            isDark
              ? 'bg-[var(--color-dark-hover)] text-[var(--color-dark-text)] hover:bg-[var(--color-dark-hover-strong)]'
              : 'bg-[var(--color-light-surface)] text-[var(--color-light-text)] hover:bg-[var(--color-light-border)]'].join(' ')}
          type="button"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy as Text'}
        </button>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors"
          type="button"
        >
          <Printer size={12} />
          Print
        </button>
      </div>
    </div>
  );
}

function receiptToText(r: QuoteReceipt): string {
  const lines: string[] = [];
  lines.push(`${r.issuer.name.toUpperCase()}`);
  lines.push(r.issuer.tagline);
  lines.push(`${r.issuer.address} · ${r.issuer.email} · GSTIN: ${r.issuer.gstin}`);
  lines.push('');
  lines.push('QUOTATION');
  lines.push(`Quote ID:      ${r.receipt_id}`);
  lines.push(`Issue Date:    ${formatDateLong(r.issue_date)}`);
  lines.push(`Valid Until:   ${formatDateLong(r.valid_until)} (30 days)`);
  lines.push(`Status:        ${r.status}`);
  lines.push(`Currency:      ${r.currency}`);
  lines.push('');
  lines.push('BILL TO');
  lines.push(`  ${r.customer.name ?? '(to be added by sales)'}`);
  if (r.customer.company) lines.push(`  ${r.customer.company}`);
  if (r.customer.email)   lines.push(`  ${r.customer.email}`);
  if (r.customer.phone)   lines.push(`  ${r.customer.phone}`);
  lines.push('');
  lines.push('CONFIGURATION');
  lines.push(`  Product:     ${r.configuration.model}`);
  lines.push(`  Form Factor: ${r.configuration.form_factor}`);
  lines.push(`  Quantity:    ${r.configuration.quantity} unit${r.configuration.quantity === 1 ? '' : 's'}`);
  if (r.configuration.use_case) lines.push(`  Use Case:    ${r.configuration.use_case}`);
  lines.push('');
  lines.push('BILL OF MATERIALS');
  for (const li of r.line_items) {
    lines.push(`  ${li.sku.padEnd(16)} ${li.description.padEnd(40)} ${String(li.quantity).padStart(3)}  ${formatINR(li.unit_price).padStart(12)}  ${formatINR(li.line_total).padStart(12)}`);
  }
  lines.push('');
  lines.push(`  Subtotal:    ${formatINR(r.subtotal).padStart(12)}`);
  lines.push(`  ${r.tax_label}: ${formatINR(r.tax_amount).padStart(12)}`);
  lines.push(`  TOTAL:       ${formatINR(r.total).padStart(12)}`);
  if (r.notes && r.notes.length > 0) {
    lines.push('');
    lines.push('NOTES');
    for (const n of r.notes) lines.push(`  • ${n}`);
  }
  lines.push('');
  lines.push('TERMS & CONDITIONS');
  r.terms.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
  return lines.join('\n');
}
