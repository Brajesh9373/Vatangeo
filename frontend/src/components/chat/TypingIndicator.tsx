import { useTheme } from '../../context/ThemeContext';

export default function TypingIndicator() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="self-start max-w-[85%] animate-fade-in">
      <div className={[
        'px-5 py-3.5 rounded-xl rounded-bl-md flex items-center gap-1',
        isDark ? 'bg-[var(--color-dark-surface)]' : 'bg-[var(--color-light-elevated)] border border-[var(--color-light-border)] shadow-sm',
      ].join(' ')}>
        <span className={[
          'w-2 h-2 rounded-full animate-blink',
          isDark ? 'bg-[var(--color-dark-muted)]' : 'bg-[var(--color-light-muted)]',
        ].join(' ')} />
        <span className={[
          'w-2 h-2 rounded-full animate-blink animate-blink-delay-1',
          isDark ? 'bg-[var(--color-dark-muted)]' : 'bg-[var(--color-light-muted)]',
        ].join(' ')} />
        <span className={[
          'w-2 h-2 rounded-full animate-blink animate-blink-delay-2',
          isDark ? 'bg-[var(--color-dark-muted)]' : 'bg-[var(--color-light-muted)]',
        ].join(' ')} />
      </div>
    </div>
  );
}
