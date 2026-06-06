import { Sparkles } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function ChatHeader() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <header
      className={[
        'h-14 px-6 flex items-center justify-between border-b shrink-0',
        isDark
          ? 'bg-[var(--color-dark-bg)] border-[var(--color-dark-border)]'
          : 'bg-[var(--color-light-bg)] border-[var(--color-light-border)]',
      ].join(' ')}
    >
      <div>
        <h2 className={['text-sm font-semibold leading-none', isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
          Vantageo AI Support
        </h2>
        <p className={['text-[10px] mt-0.5', isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
          Enterprise infrastructure assistant
        </p>
      </div>
    </header>
  );
}
