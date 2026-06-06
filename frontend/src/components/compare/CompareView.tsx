import { useEffect, useMemo, useState } from 'react';
import {
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Power,
  ShieldCheck,
  Ruler,
  Search,
  Plus,
  X,
  Check,
  Printer,
  Copy,
  FileText,
  Trophy,
  Sparkles,
  GitCompare,
  Layers,
  CircuitBoard,
  Loader2,
  Settings2,
} from 'lucide-react';
import { fetchCompare, fetchProducts } from '../../lib/api';
import { useCached } from '../../lib/useCached';
import type { CatalogProduct } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useChat } from '../../context/ChatContext';
import { formatINR } from '../../lib/format';
import type { QuoteFormDefaults } from '../../types';

const MAX_COMPARE = 4;

// ---------- Spec groups: how the comparison is organized ----------
// Each row reads from a dotted path in the spec dict. `numeric` + `higherIsBetter`
// enables the diff highlight (green = best, red = worst, neutral = equal).
interface SpecField {
  path: string;
  label: string;
  numeric?: boolean;
  higherIsBetter?: boolean;
  unit?: string;
  emphasize?: boolean; // bold value in the cell
}

interface SpecGroup {
  id: string;
  label: string;
  icon: typeof Cpu;
  fields: SpecField[];
}

const SPEC_GROUPS: SpecGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Server,
    fields: [
      { path: 'form_factor', label: 'Form Factor', emphasize: true },
      { path: 'chipset', label: 'Chipset' },
    ],
  },
  {
    id: 'processor',
    label: 'Processor',
    icon: Cpu,
    fields: [
      { path: 'processor.families', label: 'CPU Family' },
      { path: 'processor.sockets', label: 'Sockets', numeric: true, higherIsBetter: true, emphasize: true },
      { path: 'processor.max_tdp', label: 'Max TDP', numeric: true, higherIsBetter: true, unit: 'W' },
      { path: 'processor.socket_type', label: 'Socket' },
    ],
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: MemoryStick,
    fields: [
      { path: 'memory.slots', label: 'DIMM Slots', numeric: true, higherIsBetter: true, emphasize: true },
      { path: 'memory.type', label: 'Type' },
      { path: 'memory.max_speed', label: 'Max Speed' },
      { path: 'memory.channels', label: 'Channels' },
    ],
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: HardDrive,
    fields: [
      { path: 'storage.bays', label: 'Drive Bays', numeric: true, higherIsBetter: true, emphasize: true },
      { path: 'storage.drive_type', label: 'Drive Type' },
      { path: 'raid.controller', label: 'RAID Controller' },
      { path: 'raid.levels', label: 'RAID Levels' },
    ],
  },
  {
    id: 'expansion',
    label: 'Expansion',
    icon: CircuitBoard,
    fields: [
      { path: 'expansion_slots', label: 'PCIe Slots' },
    ],
  },
  {
    id: 'networking',
    label: 'Networking',
    icon: Network,
    fields: [
      { path: 'networking.name', label: 'Onboard NIC' },
      { path: 'networking.type', label: 'Port Type' },
      { path: 'networking.speed', label: 'Speed' },
    ],
  },
  {
    id: 'power',
    label: 'Power & Cooling',
    icon: Power,
    fields: [
      { path: 'psu.name', label: 'PSU' },
      { path: 'psu.capacity', label: 'Capacity' },
      { path: 'psu.redundancy', label: 'Redundancy' },
      { path: 'psu.efficiency', label: 'Efficiency' },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    icon: Settings2,
    fields: [
      { path: 'management.bmc', label: 'BMC' },
      { path: 'firmware.name', label: 'Firmware' },
      { path: 'tpm.version', label: 'TPM' },
    ],
  },
  {
    id: 'io',
    label: 'I/O & Physical',
    icon: Ruler,
    fields: [
      { path: 'front_io.usb', label: 'Front USB' },
      { path: 'rear_io.usb', label: 'Rear USB' },
      { path: 'rear_io.vga', label: 'Rear VGA' },
      { path: 'video.controller', label: 'Video' },
      { path: 'physical.width_mm', label: 'Width', numeric: true, unit: 'mm' },
      { path: 'physical.height_mm', label: 'Height', numeric: true, unit: 'mm' },
      { path: 'physical.depth_mm', label: 'Depth', numeric: true, unit: 'mm' },
    ],
  },
  {
    id: 'software',
    label: 'Software & Security',
    icon: ShieldCheck,
    fields: [
      { path: 'security', label: 'Security Features' },
      { path: 'os_support', label: 'OS Support' },
    ],
  },
];

// Fields that earn a "best for X" badge in the summary header.
const HIGHLIGHT_FIELDS: Array<{ path: string; label: string; higherIsBetter: boolean }> = [
  { path: 'memory.slots', label: 'Most memory slots', higherIsBetter: true },
  { path: 'storage.bays', label: 'Most drive bays', higherIsBetter: true },
  { path: 'processor.sockets', label: 'Most CPU sockets', higherIsBetter: true },
  { path: 'processor.max_tdp', label: 'Highest TDP', higherIsBetter: true },
];

// ---------- Value helpers ----------

function getByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).every(isEmpty);
  return false;
}

function formatValue(v: unknown, unit?: string): string {
  if (isEmpty(v)) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return unit ? `${v} ${unit}` : String(v);
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === 'true') return 'Yes';
    if (t === 'false') return 'No';
    return unit && /^\d+(\.\d+)?$/.test(t) ? `${t} ${unit}` : t;
  }
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) {
      return v.map((x) => String(x).trim()).filter(Boolean).join(', ');
    }
    if (v.every((x) => x && typeof x === 'object')) {
      return v
        .map((item) => {
          const entries = Object.entries(item as Record<string, unknown>)
            .filter(([, vv]) => !isEmpty(vv))
            .map(([k, vv]) => `${k.replace(/_/g, ' ')}: ${formatValue(vv)}`);
          return entries.join(', ');
        })
        .filter(Boolean)
        .join(' • ');
    }
    return JSON.stringify(v);
  }
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, vv]) => !isEmpty(vv))
      .map(([k, vv]) => `${k.replace(/_/g, ' ')}: ${formatValue(vv)}`)
      .join(' · ');
  }
  return String(v);
}

type DiffStatus = 'best' | 'worst' | 'middle' | 'neutral';

function computeCellStatus(
  value: unknown,
  allValues: unknown[],
  higherIsBetter: boolean,
): DiffStatus {
  if (typeof value !== 'number') return 'neutral';
  const nums = allValues.filter((v): v is number => typeof v === 'number');
  if (nums.length < 2) return 'neutral';
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max === min) return 'neutral';
  if (value === max) return higherIsBetter ? 'best' : 'worst';
  if (value === min) return higherIsBetter ? 'worst' : 'best';
  return 'middle';
}

// ---------- Main component ----------

export default function CompareView() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { dispatch } = useChat();
  const { data: products = [] } = useCached<CatalogProduct[]>('products', fetchProducts);

  const [selected, setSelected] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [comparison, setComparison] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch comparison data when 2+ selected.
  useEffect(() => {
    if (selected.length < 2) {
      setComparison({});
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCompare(selected)
      .then((data) => { if (!cancelled) setComparison(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Comparison failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  // Filter products for picker.
  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter((p) => {
      const model = (p.model ?? '').toLowerCase();
      const ff = (p.form_factor ?? '').toLowerCase();
      return model.includes(q) || ff.includes(q) || p.model?.replace(/^vantageo\s+/i, '').includes(q);
    });
  }, [products, query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const canAddMore = selected.length < MAX_COMPARE;

  const toggle = (model: string) => {
    setSelected((prev) => {
      if (prev.includes(model)) return prev.filter((m) => m !== model);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, model];
    });
  };

  const remove = (model: string) => {
    setSelected((prev) => prev.filter((m) => m !== model));
  };

  const clearAll = () => {
    setSelected([]);
    setComparison({});
  };

  const openQuoteFor = (model: string) => {
    const defaults: QuoteFormDefaults = {
      model: model.replace(/^Vantageo\s+/i, ''),
      quantity: 1,
      memory_gb: 0,
      storage_gb: 0,
      gpu_count: 0,
      use_case: '',
    };
    dispatch({ type: 'OPEN_QUOTE_FORM', payload: defaults });
  };

  const handlePrint = () => window.print();

  const handleCopy = async () => {
    const text = comparisonToText(selected, comparison);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  // ----- Styles -----
  const containerCls = isDark ? 'bg-[var(--color-dark-bg)]' : 'bg-[var(--color-light-bg)]';
  const textCls = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';
  const mutedCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  const cardCls = isDark
    ? 'bg-[var(--color-dark-surface)] border-[var(--color-dark-border)]'
    : 'bg-[var(--color-light-elevated)] border-[var(--color-light-border)] shadow-sm';
  const inputCls = isDark
    ? 'bg-[var(--color-dark-bg)] border-[var(--color-dark-border)] text-[var(--color-dark-text)] placeholder:text-[var(--color-dark-muted)] focus:border-[var(--color-brand)]'
    : 'bg-white border-[var(--color-light-border)] text-[var(--color-light-text)] placeholder:text-[var(--color-placeholder)] focus:border-[var(--color-brand)]';

  return (
    <div className={['flex-1 overflow-y-auto custom-scroll', containerCls].join(' ')}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-6 no-print">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitCompare size={18} className="text-[var(--color-brand)]" />
              <h2 className={['text-lg font-semibold', textCls].join(' ')}>Compare Models</h2>
            </div>
            <p className={['text-xs', mutedCls].join(' ')}>
              Side-by-side spec comparison across the Vantageo lineup. Select up to {MAX_COMPARE} models.
            </p>
          </div>
          {selected.length > 0 ? (
            <button
              onClick={clearAll}
              className={['text-xs font-medium transition-colors',
                isDark ? 'text-[var(--color-dark-muted)] hover:text-[var(--color-error)]'
                       : 'text-[var(--color-light-muted)] hover:text-[var(--color-error)]'].join(' ')}
              type="button"
            >
              Clear all
            </button>
          ) : null}
        </div>

        {/* Selected chips bar */}
        <div className="mb-5 no-print">
          <SelectedChips
            products={products}
            selected={selected}
            onRemove={remove}
            onAddClick={() => setPickerOpen((p) => !p)}
            canAddMore={canAddMore}
            isDark={isDark}
            cardCls={cardCls}
            textCls={textCls}
            mutedCls={mutedCls}
            onQuote={openQuoteFor}
          />
        </div>

        {/* Picker */}
        {pickerOpen ? (
          <div className={['mb-6 p-4 rounded-xl border animate-fade-in no-print', cardCls].join(' ')}>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1">
                <Search size={14} className={['absolute left-3 top-1/2 -translate-y-1/2', mutedCls].join(' ')} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by model or form factor..."
                  className={['w-full pl-9 pr-3 py-2 text-xs rounded-lg border outline-none transition-colors', inputCls].join(' ')}
                />
              </div>
              <button
                onClick={() => setPickerOpen(false)}
                className={['p-2 rounded-lg transition-colors',
                  isDark ? 'hover:bg-[var(--color-dark-hover)] text-[var(--color-dark-muted)]'
                         : 'hover:bg-[var(--color-light-hover)] text-[var(--color-light-muted)]'].join(' ')}
                type="button"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
            {filtered.length === 0 ? (
              <div className={['text-center py-8 text-xs', mutedCls].join(' ')}>
                No models match "{query}".
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map((p) => {
                  const isSelected = selectedSet.has(p.model);
                  const disabled = !isSelected && !canAddMore;
                  return (
                    <PickerCard
                      key={p.model}
                      product={p}
                      isSelected={isSelected}
                      disabled={disabled}
                      isDark={isDark}
                      onClick={() => !disabled && toggle(p.model)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* Comparison */}
        {selected.length === 0 ? (
          <EmptyState
            isDark={isDark}
            cardCls={cardCls}
            textCls={textCls}
            mutedCls={mutedCls}
            onAddClick={() => setPickerOpen(true)}
          />
        ) : selected.length === 1 ? (
          <SingleSelectedState
            model={selected[0]}
            isDark={isDark}
            cardCls={cardCls}
            textCls={textCls}
            mutedCls={mutedCls}
            onAddMore={() => setPickerOpen(true)}
            onQuote={openQuoteFor}
          />
        ) : loading ? (
          <LoadingState isDark={isDark} mutedCls={mutedCls} />
        ) : error ? (
          <ErrorState message={error} isDark={isDark} />
        ) : (
          <ComparisonTable
            selected={selected}
            comparison={comparison}
            isDark={isDark}
            textCls={textCls}
            mutedCls={mutedCls}
            cardCls={cardCls}
          />
        )}

        {/* Action bar */}
        {selected.length >= 2 && !loading && !error ? (
          <div className="no-print mt-6 flex flex-wrap items-center justify-end gap-2">
            {selected.length === 1 ? (
              <button
                onClick={() => openQuoteFor(selected[0])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors"
                type="button"
              >
                <FileText size={12} />
                Get Quote for {selected[0].replace(/^Vantageo\s+/i, '')}
              </button>
            ) : (
              <div className={['text-[11px]', mutedCls].join(' ')}>
                Tip: open a product card to quote a single model.
              </div>
            )}
            <div className="flex-1" />
            <button
              onClick={handleCopy}
              className={['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
                isDark
                  ? 'border-[var(--color-dark-border)] text-[var(--color-dark-text)] hover:bg-[var(--color-dark-hover)]'
                  : 'border-[var(--color-light-border)] text-[var(--color-light-text)] hover:bg-[var(--color-light-hover)]'].join(' ')}
              type="button"
            >
              {copied ? <Check size={12} className="text-[var(--color-success)]" /> : <Copy size={12} />}
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
        ) : null}
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function SelectedChips({
  products,
  selected,
  onRemove,
  onAddClick,
  canAddMore,
  isDark,
  cardCls,
  textCls,
  mutedCls,
  onQuote,
}: {
  products: CatalogProduct[];
  selected: string[];
  onRemove: (m: string) => void;
  onAddClick: () => void;
  canAddMore: boolean;
  isDark: boolean;
  cardCls: string;
  textCls: string;
  mutedCls: string;
  onQuote: (m: string) => void;
}) {
  return (
    <div className={['flex items-center gap-2 p-3 rounded-xl border', cardCls].join(' ')}>
      <div className={['text-[10px] uppercase tracking-wider font-semibold shrink-0', mutedCls].join(' ')}>
        Comparing
      </div>
      {selected.length === 0 ? (
        <div className={['text-xs italic', mutedCls].join(' ')}>No models selected.</div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {selected.map((m) => {
            const bare = m.replace(/^Vantageo\s+/i, '');
            const p = products.find((x) => x.model === m);
            return (
              <div
                key={m}
                className={['inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium border',
                  isDark
                    ? 'bg-[var(--color-brand)]/10 text-[var(--color-brand)] border-[var(--color-brand)]/30'
                    : 'bg-[var(--color-brand-subtle)] text-[var(--color-brand)] border-[var(--color-brand-muted)]'].join(' ')}
              >
                <Server size={11} />
                <span>{bare}</span>
                {p?.form_factor ? (
                  <span className={['text-[9px] font-normal opacity-70', isDark ? 'text-[var(--color-dark-muted)]' : ''].join(' ')}>
                    {p.form_factor}
                  </span>
                ) : null}
                <button
                  onClick={() => onQuote(m)}
                  className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors"
                  type="button"
                  title="Get quote for this model"
                >
                  <FileText size={9} />
                  Quote
                </button>
                <button
                  onClick={() => onRemove(m)}
                  className={['p-0.5 rounded transition-colors', isDark ? 'hover:bg-white/10' : 'hover:bg-white/50'].join(' ')}
                  type="button"
                  title="Remove from comparison"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex-1" />
      <button
        onClick={onAddClick}
        disabled={!canAddMore}
        className={['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors shrink-0',
          canAddMore
            ? isDark
              ? 'border-[var(--color-dark-border)] text-[var(--color-dark-text)] hover:bg-[var(--color-dark-hover)]'
              : 'border-[var(--color-light-border)] text-[var(--color-light-text)] hover:bg-[var(--color-light-hover)]'
            : isDark
              ? 'border-[var(--color-dark-border)] text-[var(--color-dark-muted)] cursor-not-allowed opacity-50'
              : 'border-[var(--color-light-border)] text-[var(--color-light-muted)] cursor-not-allowed opacity-50',
        ].join(' ')}
        type="button"
      >
        <Plus size={12} />
        Add product
      </button>
    </div>
  );
}

function PickerCard({
  product,
  isSelected,
  disabled,
  isDark,
  onClick,
}: {
  product: CatalogProduct;
  isSelected: boolean;
  disabled: boolean;
  isDark: boolean;
  onClick: () => void;
}) {
  const bare = product.model.replace(/^Vantageo\s+/i, '');
  const cls = [
    'relative flex flex-col gap-2 p-3 rounded-lg border text-left transition-all',
    isSelected
      ? isDark
        ? 'border-[var(--color-brand)] bg-[var(--color-brand-subtle)]'
        : 'border-[var(--color-brand)] bg-[var(--color-brand-subtle)] shadow-sm'
      : disabled
        ? isDark
          ? 'border-[var(--color-dark-border)] bg-[var(--color-dark-surface)] opacity-50 cursor-not-allowed'
          : 'border-[var(--color-light-border)] bg-[var(--color-light-elevated)] opacity-50 cursor-not-allowed'
        : isDark
          ? 'border-[var(--color-dark-border)] bg-[var(--color-dark-surface)] hover:border-[var(--color-brand)] cursor-pointer'
          : 'border-[var(--color-light-border)] bg-[var(--color-light-elevated)] hover:border-[var(--color-brand)] cursor-pointer shadow-sm',
  ].join(' ');

  return (
    <button onClick={onClick} className={cls} type="button" disabled={disabled}>
      {isSelected ? (
        <div className="absolute top-2 right-2 inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--color-brand)] text-white">
          <Check size={9} />
          Selected
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <div className={['w-8 h-8 rounded-md flex items-center justify-center shrink-0',
          isDark ? 'bg-[var(--color-dark-hover)] text-[var(--color-brand)]' : 'bg-[var(--color-light-surface)] text-[var(--color-brand)]'].join(' ')}>
          <Server size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={['text-sm font-semibold truncate', isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
            {bare}
          </div>
          {product.form_factor ? (
            <div className={['text-[10px]', isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
              {product.form_factor}
            </div>
          ) : null}
        </div>
      </div>
      <div className={['grid grid-cols-3 gap-1 text-[10px] pt-2 border-t',
        isDark ? 'border-[var(--color-dark-border)]' : 'border-[var(--color-light-border)]'].join(' ')}>
        <div>
          <div className={isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'}>DIMMs</div>
          <div className={['font-semibold', isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
            {product.dimm_slots ?? '—'}
          </div>
        </div>
        <div>
          <div className={isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'}>TDP</div>
          <div className={['font-semibold', isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
            {product.max_tdp_w ? `${product.max_tdp_w}W` : '—'}
          </div>
        </div>
        <div>
          <div className={isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'}>Memory</div>
          <div className={['font-semibold truncate', isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
            {product.memory_type ?? '—'}
          </div>
        </div>
      </div>
    </button>
  );
}

function ComparisonTable({
  selected,
  comparison,
  isDark,
  textCls,
  mutedCls,
  cardCls,
}: {
  selected: string[];
  comparison: Record<string, Record<string, unknown>>;
  isDark: boolean;
  textCls: string;
  mutedCls: string;
  cardCls: string;
}) {
  // Compute per-group winner summary for the header strip.
  const winnerByField = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const { path, higherIsBetter } of HIGHLIGHT_FIELDS) {
      let best: number | null = null;
      let bestModel: string | null = null;
      for (const m of selected) {
        const v = getByPath(comparison[m], path);
        if (typeof v === 'number') {
          if (best === null || (higherIsBetter ? v > best : v < best)) {
            best = v;
            bestModel = m;
          }
        }
      }
      out[path] = bestModel;
    }
    return out;
  }, [selected, comparison]);

  const borderCls = isDark ? 'border-[var(--color-dark-border)]' : 'border-[var(--color-light-border)]';
  const rowHoverCls = isDark ? 'hover:bg-[var(--color-dark-hover)]' : 'hover:bg-[var(--color-light-hover)]';
  const stripeCls = isDark ? 'bg-[var(--color-dark-bg)]/40' : 'bg-[var(--color-light-surface)]/40';

  // Diff cell colors
  const cellCls = (status: DiffStatus): string => {
    if (status === 'best') {
      return isDark
        ? 'bg-[var(--color-success)]/12 text-[var(--color-success)] font-semibold'
        : 'bg-[var(--color-success-subtle)] text-[var(--color-success)] font-semibold';
    }
    if (status === 'worst') {
      return isDark
        ? 'bg-[var(--color-error)]/8 text-[var(--color-error)]/80'
        : 'bg-[var(--color-error-subtle)] text-[var(--color-error)]/80';
    }
    return '';
  };

  return (
    <div className="space-y-4">
      {/* Model header cards */}
      <div className={['rounded-xl border overflow-hidden', cardCls].join(' ')}>
        <div className="grid" style={{ gridTemplateColumns: `220px repeat(${selected.length}, minmax(180px, 1fr))` }}>
          <div className={['px-4 py-4 flex flex-col justify-end', mutedCls].join(' ')}>
            <div className="text-[10px] uppercase tracking-wider font-semibold">Models</div>
            <div className={['text-sm font-semibold mt-1', textCls].join(' ')}>{selected.length} selected</div>
          </div>
          {selected.map((m) => {
            const spec = comparison[m] ?? {};
            const ff = String(getByPath(spec, 'form_factor') ?? '');
            const dimm = getByPath(spec, 'memory.slots');
            const bays = getByPath(spec, 'storage.bays');
            return (
              <div key={m} className={['px-4 py-4 border-l', borderCls].join(' ')}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-[var(--color-brand)]/10 text-[var(--color-brand)] flex items-center justify-center shrink-0">
                    <Server size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className={['text-sm font-semibold truncate', textCls].join(' ')}>
                      {m.replace(/^Vantageo\s+/i, '')}
                    </div>
                    {ff ? <div className={['text-[10px]', mutedCls].join(' ')}>{ff}</div> : null}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px]">
                  <span>
                    <span className={mutedCls}>DIMM </span>
                    <span className={['font-semibold', textCls].join(' ')}>{typeof dimm === 'number' ? dimm : '—'}</span>
                  </span>
                  <span>
                    <span className={mutedCls}>Bays </span>
                    <span className={['font-semibold', textCls].join(' ')}>{typeof bays === 'number' ? bays : '—'}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Winners strip */}
      {HIGHLIGHT_FIELDS.some((f) => winnerByField[f.path]) ? (
        <div className={['flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl border text-[11px]', cardCls].join(' ')}>
          <Trophy size={14} className="text-[var(--color-brand)] shrink-0" />
          <span className={['font-semibold uppercase tracking-wider text-[10px]', mutedCls].join(' ')}>Winners</span>
          {HIGHLIGHT_FIELDS.map((f) => {
            const winner = winnerByField[f.path];
            if (!winner) return null;
            return (
              <span
                key={f.path}
                className={['inline-flex items-center gap-1.5 px-2 py-1 rounded-md',
                  isDark ? 'bg-[var(--color-dark-hover)] text-[var(--color-dark-text)]'
                         : 'bg-[var(--color-accent-subtle)] text-[var(--color-light-text)]'].join(' ')}
              >
                <Sparkles size={10} className="text-[var(--color-brand)]" />
                <span className={mutedCls}>{f.label}:</span>
                <span className="font-semibold">{winner.replace(/^Vantageo\s+/i, '')}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Grouped spec table */}
      <div className={['rounded-xl border overflow-hidden', cardCls].join(' ')}>
        <div className="overflow-x-auto custom-scroll">
          <table className="w-full text-xs" style={{ minWidth: 220 + selected.length * 180 }}>
            <tbody>
              {SPEC_GROUPS.map((group) => (
                <SpecGroupBlock
                  key={group.id}
                  group={group}
                  selected={selected}
                  comparison={comparison}
                  isDark={isDark}
                  textCls={textCls}
                  mutedCls={mutedCls}
                  borderCls={borderCls}
                  rowHoverCls={rowHoverCls}
                  stripeCls={stripeCls}
                  cellCls={cellCls}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SpecGroupBlock({
  group,
  selected,
  comparison,
  isDark,
  textCls,
  mutedCls,
  borderCls,
  rowHoverCls,
  stripeCls,
  cellCls,
}: {
  group: SpecGroup;
  selected: string[];
  comparison: Record<string, Record<string, unknown>>;
  isDark: boolean;
  textCls: string;
  mutedCls: string;
  borderCls: string;
  rowHoverCls: string;
  stripeCls: string;
  cellCls: (s: DiffStatus) => string;
}) {
  // Skip empty groups where every model has no value for any field.
  const hasAnyValue = group.fields.some((f) =>
    selected.some((m) => !isEmpty(getByPath(comparison[m], f.path))),
  );
  if (!hasAnyValue) return null;

  const Icon = group.icon;
  const headerCls = isDark
    ? 'bg-[var(--color-dark-bg)] text-[var(--color-dark-muted)]'
    : 'bg-[var(--color-light-bg)] text-[var(--color-light-muted)]';

  return (
    <>
      <tr className={headerCls}>
        <td colSpan={selected.length + 1} className={['px-4 py-2 border-y', borderCls].join(' ')}>
          <div className="flex items-center gap-2">
            <Icon size={12} className="text-[var(--color-brand)]" />
            <span className="text-[10px] uppercase tracking-wider font-semibold">{group.label}</span>
          </div>
        </td>
      </tr>
      {group.fields.map((field, fi) => {
        const allValues = selected.map((m) => getByPath(comparison[m], field.path));
        // If every value is empty, skip the row entirely.
        if (allValues.every(isEmpty)) return null;

        return (
          <tr key={field.path} className={['border-b', borderCls, fi % 2 === 1 ? stripeCls : '', rowHoverCls].join(' ')}>
            <td className={['px-4 py-2.5 font-medium whitespace-nowrap', mutedCls].join(' ')}>
              {field.label}
            </td>
            {selected.map((m) => {
              const v = getByPath(comparison[m], field.path);
              const status = field.numeric
                ? computeCellStatus(v, allValues, field.higherIsBetter ?? true)
                : 'neutral';
              const display = formatValue(v, field.unit);
              return (
                <td
                  key={m}
                  className={['px-4 py-2.5 align-top border-l', borderCls, cellCls(status), field.emphasize ? 'font-semibold' : ''].join(' ')}
                >
                  <div className="break-words">{display}</div>
                  {status === 'best' ? (
                    <div className="text-[9px] uppercase tracking-wider mt-0.5 opacity-80">Best</div>
                  ) : null}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function EmptyState({
  isDark,
  cardCls,
  textCls,
  mutedCls,
  onAddClick,
}: {
  isDark: boolean;
  cardCls: string;
  textCls: string;
  mutedCls: string;
  onAddClick: () => void;
}) {
  return (
    <div className={['rounded-xl border p-12 text-center', cardCls].join(' ')}>
      <div className={['w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
        isDark ? 'bg-[var(--color-dark-hover)] text-[var(--color-brand)]'
               : 'bg-[var(--color-brand-subtle)] text-[var(--color-brand)]'].join(' ')}>
        <GitCompare size={28} />
      </div>
      <h3 className={['text-base font-semibold mb-1', textCls].join(' ')}>
        Start by selecting models
      </h3>
      <p className={['text-xs max-w-md mx-auto mb-5', mutedCls].join(' ')}>
        Pick up to {MAX_COMPARE} Vantageo servers to see them side by side. We highlight the best in each category so you can spot the right fit at a glance.
      </p>
      <button
        onClick={onAddClick}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors"
        type="button"
      >
        <Plus size={14} />
        Browse models
      </button>
    </div>
  );
}

function SingleSelectedState({
  model,
  isDark,
  cardCls,
  textCls,
  mutedCls,
  onAddMore,
  onQuote,
}: {
  model: string;
  isDark: boolean;
  cardCls: string;
  textCls: string;
  mutedCls: string;
  onAddMore: () => void;
  onQuote: (m: string) => void;
}) {
  return (
    <div className={['rounded-xl border p-10 text-center', cardCls].join(' ')}>
      <div className={['w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center',
        isDark ? 'bg-[var(--color-dark-hover)] text-[var(--color-brand)]'
               : 'bg-[var(--color-brand-subtle)] text-[var(--color-brand)]'].join(' ')}>
        <Layers size={22} />
      </div>
      <h3 className={['text-sm font-semibold mb-1', textCls].join(' ')}>
        Add at least one more model
      </h3>
      <p className={['text-xs max-w-md mx-auto mb-4', mutedCls].join(' ')}>
        You've selected <span className="font-semibold text-[var(--color-brand)]">{model.replace(/^Vantageo\s+/i, '')}</span>.
        Pick one or more additional models to start comparing.
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onAddMore}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors"
          type="button"
        >
          <Plus size={12} />
          Add another
        </button>
        <button
          onClick={() => onQuote(model)}
          className={['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
            isDark
              ? 'border-[var(--color-dark-border)] text-[var(--color-dark-text)] hover:bg-[var(--color-dark-hover)]'
              : 'border-[var(--color-light-border)] text-[var(--color-light-text)] hover:bg-[var(--color-light-hover)]'].join(' ')}
          type="button"
        >
          <FileText size={12} />
          Get Quote
        </button>
      </div>
    </div>
  );
}

function LoadingState({ isDark, mutedCls }: { isDark: boolean; mutedCls: string }) {
  return (
    <div className={['flex items-center justify-center gap-2 py-12 text-sm', mutedCls].join(' ')}>
      <Loader2 size={16} className="animate-spin" />
      Loading comparison...
    </div>
  );
}

function ErrorState({ message, isDark }: { message: string; isDark: boolean }) {
  return (
    <div className={['px-4 py-3 rounded-lg text-sm border',
      isDark
        ? 'bg-[var(--color-error-subtle)] text-[var(--color-error)] border-[var(--color-error)]/30'
        : 'bg-[var(--color-error-subtle)] text-[var(--color-error)] border-[var(--color-error)]/30'].join(' ')}>
      {message}
    </div>
  );
}

// ---------- Export helpers (for Copy as Text) ----------

function comparisonToText(
  selected: string[],
  comparison: Record<string, Record<string, unknown>>,
): string {
  const lines: string[] = [];
  lines.push('VANTAGEO MODEL COMPARISON');
  lines.push('='.repeat(60));
  lines.push(`Models: ${selected.map((m) => m.replace(/^Vantageo\s+/i, '')).join(' vs ')}`);
  lines.push(`Generated: ${new Date().toLocaleString('en-IN')}`);
  lines.push('');

  for (const group of SPEC_GROUPS) {
    const rows = group.fields.filter((f) =>
      selected.some((m) => !isEmpty(getByPath(comparison[m], f.path))),
    );
    if (rows.length === 0) continue;
    lines.push(group.label.toUpperCase());
    lines.push('-'.repeat(60));
    for (const field of rows) {
      const label = field.label.padEnd(20);
      const values = selected
        .map((m) => formatValue(getByPath(comparison[m], field.path), field.unit))
        .map((v, i) => `${selected[i].replace(/^Vantageo\s+/i, '')}: ${v}`);
      lines.push(`  ${label}${values.join('  |  ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
