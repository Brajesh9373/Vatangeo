import { Sparkles } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  onUsePrompt: (text: string) => void;
}

const RECOMMENDATIONS = [
  { title: 'High-performance AI workloads', prompt: 'I need a server for AI workloads with high GPU capacity' },
  { title: 'Database & memory-intensive apps', prompt: 'Recommend a server with maximum memory for a large database' },
  { title: 'Edge / compact deployment', prompt: 'I need a 1U rack server for edge deployment' },
  { title: 'Enterprise storage server', prompt: 'Recommend a server optimized for storage capacity' },
];

export default function RecommendationsView({ onUsePrompt }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className={['flex-1 overflow-y-auto custom-scroll', isDark ? 'bg-[var(--color-dark-bg)]' : 'bg-[var(--color-light-bg)]'].join(' ')}>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={18} className="text-[var(--color-brand)]" />
          <h2 className={['text-lg font-semibold', isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
            Recommendations
          </h2>
        </div>
        <p className={['text-sm mb-6', isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
          Pick a scenario to get tailored server suggestions, or describe your own in the chat.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {RECOMMENDATIONS.map((r) => (
            <button
              key={r.title}
              onClick={() => onUsePrompt(r.prompt)}
              className={[
                'flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all',
                'hover:border-[var(--color-brand)] hover:shadow-md',
                isDark
                  ? 'border-[var(--color-dark-border)] bg-[var(--color-dark-surface)] hover:bg-[var(--color-dark-hover)]'
                  : 'border-[var(--color-light-border)] bg-[var(--color-light-elevated)] shadow-sm hover:bg-[var(--color-accent-subtle)]',
              ].join(' ')}
            >
              <span className={['text-sm font-semibold', isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'].join(' ')}>
                {r.title}
              </span>
              <span className={['text-[11px]', isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
                {r.prompt}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
