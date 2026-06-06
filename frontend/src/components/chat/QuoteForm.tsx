import { useState, useEffect, type FormEvent } from 'react';
import { X, FileText, Loader2, Minus, Plus, Calculator, AlertCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { fetchQuote, fetchQuotePreview, fetchQuoteLimits } from '../../lib/api';
import { genId, formatINR } from '../../lib/format';
import { useChat } from '../../context/ChatContext';
import type { Message, QuoteReceipt, QuotePreview, QuoteLimits, QuoteFormState } from '../../types';

interface Props {
  state: QuoteFormState;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function QuoteForm({ state }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { dispatch } = useChat();
  const { defaults, isSubmitting, error } = state;

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState<number>(defaults.quantity || 1);
  const [memoryGb, setMemoryGb] = useState<number>(defaults.memory_gb || 0);
  const [storageGb, setStorageGb] = useState<number>(defaults.storage_gb || 0);
  const [gpuCount, setGpuCount] = useState<number>(defaults.gpu_count || 0);
  const [validationErr, setValidationErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<QuotePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [limits, setLimits] = useState<QuoteLimits | null>(null);
  const [limitsError, setLimitsError] = useState(false);

  // Fetch model-specific caps (max memory/storage/GPU) on mount. Used to
  // pre-fill sensible defaults, label each field with its cap, and disable
  // the GPU field on models that don't support GPUs. The model itself is
  // readonly, so this fetch happens once per form-open.
  useEffect(() => {
    let cancelled = false;
    fetchQuoteLimits(defaults.model)
      .then((l) => {
        if (cancelled) return;
        setLimits(l);
        // If the LLM didn't extract a value, pre-fill with the model's own
        // default. Otherwise keep the LLM's extracted value.
        setMemoryGb((cur) => (cur > 0 ? cur : l.default_dimm_gb));
        setStorageGb((cur) => (cur > 0 ? cur : l.default_drive_gb));
        // GPUs: clamp to model cap if the LLM extracted more than supported.
        if (!l.gpu_supported) setGpuCount(0);
        else setGpuCount((cur) => Math.min(cur, l.max_gpu));
      })
      .catch(() => { if (!cancelled) setLimitsError(true); });
    return () => { cancelled = true; };
  }, [defaults.model]);

  // Live price preview — debounced so we don't hammer the API on every keystroke.
  useEffect(() => {
    if (isSubmitting) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const p = await fetchQuotePreview({
          model: defaults.model,
          quantity,
          memory_gb: memoryGb,
          storage_gb: storageGb,
          gpu_count: gpuCount,
        });
        if (!cancelled) setPreview(p);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [quantity, memoryGb, storageGb, gpuCount, isSubmitting, defaults.model]);

  const cardBg = isDark
    ? 'bg-[var(--color-dark-surface)] border-[var(--color-dark-border)]'
    : 'bg-[var(--color-light-elevated)] border-[var(--color-light-border)]';
  const muted = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  const text = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';
  const subtext = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-text-soft)]';
  const inputBg = isDark
    ? 'bg-[var(--color-dark-bg)] border-[var(--color-dark-border)] text-[var(--color-dark-text)] placeholder:text-[var(--color-dark-muted)] focus:border-[var(--color-brand)]'
    : 'bg-white border-[var(--color-light-border)] text-[var(--color-light-text)] placeholder:text-[var(--color-placeholder)] focus:border-[var(--color-brand)]';

  const handleCancel = () => {
    dispatch({ type: 'CLOSE_QUOTE_FORM' });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationErr(null);

    if (!name.trim()) {
      setValidationErr('Name is required.');
      return;
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      setValidationErr('Please enter a valid email address.');
      return;
    }
    if (quantity < 1) {
      setValidationErr('Quantity must be at least 1.');
      return;
    }
    if (memoryGb < 0 || storageGb < 0 || gpuCount < 0) {
      setValidationErr('Numeric values cannot be negative.');
      return;
    }

    dispatch({ type: 'SET_QUOTE_FORM_SUBMITTING', payload: true });
    dispatch({ type: 'SET_QUOTE_FORM_ERROR', payload: null });

    try {
      const receipt: QuoteReceipt = await fetchQuote({
        model: defaults.model,
        quantity,
        memory_gb: memoryGb,
        storage_gb: storageGb,
        gpu_count: gpuCount,
        use_case: defaults.use_case,
        customer: {
          name: name.trim(),
          company: company.trim(),
          email: email.trim(),
          phone: phone.trim(),
        },
      });

      const assistantMsg: Message = {
        id: genId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolResults: [
          {
            tool: 'generate_quote',
            args: { ...defaults, quantity, memory_gb: memoryGb, storage_gb: storageGb, gpu_count: gpuCount },
            result: receipt,
          },
        ],
      };
      dispatch({ type: 'ADD_MESSAGE', payload: assistantMsg });
      dispatch({ type: 'CLOSE_QUOTE_FORM' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate quote';
      dispatch({ type: 'SET_QUOTE_FORM_ERROR', payload: msg });
    } finally {
      dispatch({ type: 'SET_QUOTE_FORM_SUBMITTING', payload: false });
    }
  };

  const displayModel = defaults.model.startsWith('Vantageo ')
    ? defaults.model
    : `Vantageo ${defaults.model}`;

  // Smart formatter: show TB when the cap is a whole-thousand multiple of GB.
  // 1024 → "1 TB", 12000 → "12 TB", 256 → "256 GB".
  const formatCap = (gb: number) =>
    gb >= 1000 && gb % 1000 === 0 ? `${gb / 1000} TB` : `${gb} GB`;

  return (
    <div className="flex gap-3 max-w-[85%] self-start animate-slide-up">
      <div className="w-8 h-8 rounded-full bg-[var(--color-brand)] flex items-center justify-center shrink-0">
        <FileText size={14} className="text-white" />
      </div>
      <form
        onSubmit={handleSubmit}
        className={['flex-1 min-w-0 rounded-2xl rounded-bl-md shadow-sm border-2 p-4 no-print', cardBg, 'border-[var(--color-brand)]/40'].join(' ')}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className={['text-sm font-semibold', text].join(' ')}>Quote request</div>
            <div className={['text-[10px] mt-0.5', muted].join(' ')}>
              Fill in your details to receive a formal quotation.
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className={['p-1 rounded transition-colors', muted, isDark ? 'hover:bg-[var(--color-dark-hover)]' : 'hover:bg-[var(--color-light-surface)]'].join(' ')}
            title="Cancel"
          >
            <X size={14} />
          </button>
        </div>

        {/* Customer details */}
        <div className="mb-4">
          <div className={['text-[10px] uppercase tracking-wider font-semibold mb-2', muted].join(' ')}>
            Customer details
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Name *">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rajesh Kumar"
                disabled={isSubmitting}
                className={['w-full text-xs px-2.5 py-1.5 rounded-md border outline-none transition-colors', inputBg].join(' ')}
                required
              />
            </Field>
            <Field label="Company">
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Corporation"
                disabled={isSubmitting}
                className={['w-full text-xs px-2.5 py-1.5 rounded-md border outline-none transition-colors', inputBg].join(' ')}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rajesh@acme.in"
                disabled={isSubmitting}
                className={['w-full text-xs px-2.5 py-1.5 rounded-md border outline-none transition-colors', inputBg].join(' ')}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91-98765-43210"
                disabled={isSubmitting}
                className={['w-full text-xs px-2.5 py-1.5 rounded-md border outline-none transition-colors', inputBg].join(' ')}
              />
            </Field>
          </div>
        </div>

        {/* Configuration */}
        <div className="mb-4">
          <div className={['text-[10px] uppercase tracking-wider font-semibold mb-2', muted].join(' ')}>
            Configuration
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Model" hint={limits?.form_factor ?? undefined}>
              <div className={['w-full text-xs px-2.5 py-1.5 rounded-md border font-medium',
                isDark ? 'bg-[var(--color-dark-hover)] border-[var(--color-dark-border)] text-[var(--color-dark-muted)]'
                       : 'bg-[var(--color-light-surface)] border-[var(--color-light-border)] text-[var(--color-light-muted)]'].join(' ')}>
                {displayModel}
              </div>
            </Field>
            <Field label="Quantity" hint={quantity > 1 ? `${quantity} units` : '1 unit'}>
              <div className={['flex items-stretch rounded-md border overflow-hidden', inputBg].join(' ')}>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={isSubmitting || quantity <= 1}
                  className="px-2.5 hover:bg-[var(--color-brand-subtle)] disabled:opacity-30 transition-colors flex items-center justify-center text-[var(--color-light-muted)]"
                  aria-label="Decrease quantity"
                >
                  <Minus size={12} />
                </button>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isSubmitting}
                  className="flex-1 min-w-0 text-center text-xs py-1.5 outline-none tabular-nums bg-transparent border-0"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  disabled={isSubmitting}
                  className="px-2.5 hover:bg-[var(--color-brand-subtle)] transition-colors flex items-center justify-center text-[var(--color-light-muted)]"
                  aria-label="Increase quantity"
                >
                  <Plus size={12} />
                </button>
              </div>
            </Field>
            <Field
              label="Memory (GB)"
              hint={limits ? `max ${formatCap(limits.max_memory_gb)}` : undefined}
            >
              <input
                type="number"
                min={0}
                max={limits?.max_memory_gb}
                step={32}
                value={memoryGb || ''}
                onChange={(e) => {
                  const v = Math.max(0, parseInt(e.target.value) || 0);
                  setMemoryGb(limits ? Math.min(v, limits.max_memory_gb) : v);
                }}
                placeholder={limits ? `${limits.default_dimm_gb}` : '256'}
                disabled={isSubmitting}
                className={['w-full text-xs px-2.5 py-1.5 rounded-md border outline-none transition-colors tabular-nums', inputBg].join(' ')}
              />
            </Field>
            <Field
              label="Storage (GB)"
              hint={limits ? `max ${formatCap(limits.max_storage_gb)}` : undefined}
            >
              <input
                type="number"
                min={0}
                max={limits?.max_storage_gb}
                step={1000}
                value={storageGb || ''}
                onChange={(e) => {
                  const v = Math.max(0, parseInt(e.target.value) || 0);
                  setStorageGb(limits ? Math.min(v, limits.max_storage_gb) : v);
                }}
                placeholder={limits ? `${limits.default_drive_gb}` : '2000'}
                disabled={isSubmitting}
                className={['w-full text-xs px-2.5 py-1.5 rounded-md border outline-none transition-colors tabular-nums', inputBg].join(' ')}
              />
            </Field>
            <Field
              label="GPUs"
              hint={
                limits
                  ? limits.gpu_supported
                    ? `max ${limits.max_gpu}`
                    : 'not supported'
                  : undefined
              }
            >
              <input
                type="number"
                min={0}
                max={limits?.max_gpu}
                value={gpuCount}
                onChange={(e) => {
                  const v = Math.max(0, parseInt(e.target.value) || 0);
                  setGpuCount(limits ? Math.min(v, limits.max_gpu) : v);
                }}
                disabled={isSubmitting || (limits ? !limits.gpu_supported : false)}
                className={['w-full text-xs px-2.5 py-1.5 rounded-md border outline-none transition-colors tabular-nums', inputBg, limits && !limits.gpu_supported ? 'opacity-50' : ''].join(' ')}
              />
            </Field>
            {defaults.use_case ? (
              <Field label="Use Case">
                <div className={['w-full text-xs px-2.5 py-1.5 rounded-md border',
                  isDark ? 'bg-[var(--color-dark-hover)] border-[var(--color-dark-border)] text-[var(--color-dark-muted)]'
                         : 'bg-[var(--color-light-surface)] border-[var(--color-light-border)] text-[var(--color-light-muted)]'].join(' ')}>
                  {defaults.use_case}
                </div>
              </Field>
            ) : null}
          </div>
          <div className={['text-[10px] mt-2 italic', subtext].join(' ')}>
            Requesting beyond model max will be auto-capped (noted in receipt).
          </div>

          {preview ? (
            <div className={['mt-2.5 px-3 py-2 rounded-md border flex items-center gap-x-2 gap-y-1 flex-wrap text-[11px]',
              isDark
                ? 'bg-[var(--color-dark-hover)] border-[var(--color-brand-muted)]'
                : 'bg-[var(--color-brand-subtle)] border-[var(--color-brand-muted)]/60'].join(' ')}>
              <Calculator size={11} className="text-[var(--color-brand)] shrink-0" />
              <span className={['shrink-0', muted].join(' ')}>Per unit</span>
              <span className="tabular-nums font-semibold text-[var(--color-brand)]">{formatINR(preview.per_unit)}</span>
              <span className={muted}>×</span>
              <span className="tabular-nums font-medium">{quantity}</span>
              <span className={muted}>=</span>
              <span className="tabular-nums font-bold text-[var(--color-brand)]">{formatINR(preview.total)}</span>
              <span className={['text-[9px] italic ml-auto shrink-0', muted].join(' ')}>incl. IGST 18%</span>
              {preview.notes && preview.notes.length > 0 ? (
                <div className="basis-full flex items-start gap-1 mt-1 pt-1.5 border-t border-[var(--color-brand-muted)]/30">
                  <AlertCircle size={10} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
                  <span className={['text-[10px] leading-snug', subtext].join(' ')}>
                    {preview.notes.join(' · ')}
                  </span>
                </div>
              ) : null}
            </div>
          ) : previewLoading ? (
            <div className={['mt-2.5 px-3 py-1.5 text-[10px] flex items-center gap-1.5', muted].join(' ')}>
              <Loader2 size={10} className="animate-spin" />
              Calculating…
            </div>
          ) : null}
        </div>

        {(validationErr || error) ? (
          <div className="mb-3 px-2.5 py-2 rounded text-[11px] bg-[var(--color-error-subtle)] text-[var(--color-error)] border border-[var(--color-error)]/30">
            {validationErr || error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className={['px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              isDark ? 'text-[var(--color-dark-muted)] hover:bg-[var(--color-dark-hover)]'
                     : 'text-[var(--color-light-muted)] hover:bg-[var(--color-light-surface)]'].join(' ')}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : null}
            {isSubmitting ? 'Generating...' : 'Generate Quote'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const muted = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className={['text-[10px] font-medium', muted].join(' ')}>{label}</span>
        {hint ? <span className={['text-[9px] italic', muted].join(' ')}>{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}
