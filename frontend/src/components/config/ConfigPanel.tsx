import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useConfig } from '../../context/ConfigContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDERS = [
  { value: 'commandcode' as const, label: 'CMD-CODE' },
  { value: 'nvidia' as const, label: 'NVIDIA' },
];

export default function ConfigPanel({ isOpen, onClose }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const cfg = useConfig();
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  const handleSave = useCallback(async () => {
    const ok = await cfg.save();
    if (ok) {
      setSaved(true);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 2500);
    }
  }, [cfg]);

  // Use passive listener for backdrop click (eliminates scroll delay on touch)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      if (savedTimerRef.current) {
        window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const panelBg = isDark ? 'bg-[var(--color-dark-surface)]' : 'bg-[var(--color-light-elevated)]';
  const borderCls = isDark ? 'border-[var(--color-dark-border)]' : 'border-[var(--color-light-border)]';
  const mutedCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  const inputBg = isDark ? 'bg-[var(--color-dark-bg)] text-[var(--color-dark-text)]' : 'bg-[var(--color-light-bg)] text-[var(--color-light-text)]';
  const inputBorder = isDark ? 'border-[var(--color-dark-border)]' : 'border-[var(--color-light-border)]';

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        onWheel={(e) => e.stopPropagation()}
      />
      <div className={['fixed top-0 right-0 z-50 w-80 h-full shadow-2xl flex flex-col animate-slide-up', panelBg].join(' ')}>
        <div className={['flex items-center justify-between px-5 py-3 border-b shrink-0', borderCls].join(' ')}>
          <h3 className="text-sm font-semibold tracking-wide text-[var(--color-light-text)] dark:text-[var(--color-dark-text)]">
            CONFIGURATION
          </h3>
          <button
            onClick={onClose}
            className={['p-1 rounded transition-colors', isDark ? 'hover:bg-[var(--color-dark-hover-strong)] text-[var(--color-dark-muted)]' : 'hover:bg-[var(--color-light-surface)]', mutedCls].join(' ')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <label className={['block text-[10px] font-medium uppercase tracking-wider mb-1.5', mutedCls].join(' ')}>Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => cfg.setProvider(p.value)}
                  className={[
                    'px-3 py-2 rounded-lg text-xs font-medium border transition-all',
                    cfg.provider === p.value
                      ? 'border-[var(--color-brand)] bg-[var(--color-brand-subtle)] text-[var(--color-brand)]'
                      : isDark
                        ? 'border-[var(--color-dark-border)] text-[var(--color-dark-muted)] hover:border-[var(--color-dark-muted)]'
                        : 'border-[var(--color-light-border)] text-[var(--color-light-muted)] hover:border-[var(--color-light-border-active)] hover:text-[var(--color-light-text-soft)]',
                  ].join(' ')}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={['block text-[10px] font-medium uppercase tracking-wider mb-1.5', mutedCls].join(' ')}>Model</label>
            <input
              type="text"
              value={cfg.modelName}
              onChange={(e) => cfg.setModelName(e.target.value)}
              placeholder="deepseek-ai/deepseek-v4-pro"
              className={['w-full px-3 py-2 rounded-lg text-xs outline-none border transition-colors', inputBg, inputBorder, 'focus:border-[var(--color-brand)]'].join(' ')}
            />
          </div>

          <div>
            <label className={['block text-[10px] font-medium uppercase tracking-wider mb-1.5', mutedCls].join(' ')}>API Key</label>
            <input
              type="password"
              value={cfg.apiKey}
              onChange={(e) => cfg.setApiKey(e.target.value)}
              placeholder="nvapi-..."
              className={['w-full px-3 py-2 rounded-lg text-xs outline-none border transition-colors', inputBg, inputBorder, 'focus:border-[var(--color-brand)]'].join(' ')}
            />
          </div>
        </div>

        <div className={['px-5 py-4 border-t space-y-2 shrink-0', borderCls].join(' ')}>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 py-2 rounded-lg bg-[var(--color-brand)] text-white text-xs font-medium hover:bg-[var(--color-brand-hover)] transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              {saved ? <Check size={14} /> : null}
              {saved ? 'Saved' : 'Save Config'}
            </button>
            <button
              onClick={() => cfg.test()}
              disabled={cfg.testStatus === 'testing'}
              className={[
                'px-4 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5',
                cfg.testStatus === 'testing' ? 'opacity-50' : '',
                isDark
                  ? 'border-[var(--color-dark-border)] text-[var(--color-dark-muted)] hover:border-[var(--color-dark-muted)]'
                  : 'border-[var(--color-light-border)] text-[var(--color-light-text-soft)] hover:border-[var(--color-light-border-active)] hover:bg-[var(--color-light-surface)]',
              ].join(' ')}
            >
              {cfg.testStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : null}
              Test
            </button>
          </div>
          {cfg.testStatus === 'ok' ? (
            <div className="flex items-center gap-1.5 text-[var(--color-success)] text-xs">
              <Check size={14} /> Connection successful
            </div>
          ) : null}
          {cfg.testStatus === 'fail' ? (
            <div className="flex items-center gap-1.5 text-[var(--color-error)] text-xs">
              <AlertCircle size={14} /> Connection failed — check key
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
