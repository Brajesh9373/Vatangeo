import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { Send, Paperclip, Square } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export default function ChatInput({ onSend, onStop, disabled, isStreaming }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  useEffect(() => { adjustHeight(); }, [text, adjustHeight]);

  const handleSend = useCallback(() => {
    const msg = text.trim();
    if (!msg || disabled) return;
    onSend(msg);
    setText('');
  }, [text, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const containerCls = [
    'flex items-end gap-2 px-4 py-3 border-t shrink-0',
    isDark ? 'bg-[var(--color-dark-bg)] border-[var(--color-dark-border)]'
           : 'bg-[var(--color-light-bg)] border-[var(--color-light-border)]',
  ].join(' ');

  const textareaCls = [
    'flex-1 resize-none outline-none text-sm leading-relaxed py-2.5 px-3 rounded-xl',
    'placeholder:text-[var(--color-placeholder)] transition-[border-color,background,box-shadow]',
    'min-h-[40px] max-h-[120px]',
    isDark
      ? 'bg-[var(--color-dark-surface)] text-[var(--color-dark-text)] border border-[var(--color-dark-border)] focus:border-[var(--color-brand)]'
      : 'bg-[var(--color-light-elevated)] text-[var(--color-light-text)] border border-[var(--color-light-border)] focus:border-[var(--color-brand)] focus:ring-1 focus:ring-[var(--color-brand)]/20',
  ].join(' ');

  const canSend = text.trim() && !disabled;

  return (
    <div className={containerCls}>
      <button
        className={['p-2 rounded-lg transition-colors', isDark ? 'text-[var(--color-dark-muted)] hover:bg-[var(--color-dark-hover)]' : 'text-[var(--color-light-muted)] hover:bg-[var(--color-light-surface)]'].join(' ')}
        title="Attach file"
        type="button"
      >
        <Paperclip size={18} />
      </button>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isStreaming ? 'Generating response...' : 'Type your message...'}
        rows={1}
        disabled={isStreaming}
        className={textareaCls}
      />
      {isStreaming ? (
        <button
          onClick={onStop}
          className={[
            'p-2.5 rounded-xl transition-all flex items-center justify-center shrink-0',
            'bg-[var(--color-error)] text-white hover:bg-[var(--color-error)]/90 active:scale-90 shadow-sm',
            'animate-fade-in',
          ].join(' ')}
          type="button"
          title="Stop generating"
          aria-label="Stop generating"
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={[
            'p-2.5 rounded-xl transition-all flex items-center justify-center shrink-0',
            canSend
              ? 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] active:scale-90 shadow-sm'
              : isDark
                ? 'bg-[var(--color-dark-hover)] text-[var(--color-dark-muted)] cursor-not-allowed'
                : 'bg-[var(--color-light-surface)] text-[var(--color-light-muted)] cursor-not-allowed',
          ].join(' ')}
          type="button"
        >
          <Send size={16} />
        </button>
      )}
    </div>
  );
}
