import { useTheme } from '../../context/ThemeContext';

interface Props {
  data: Record<string, unknown>;
}

export default function SpecCard({ data }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const entries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
  );

  if (entries.length === 0) return null;

  return (
    <div
      className={[
        'mt-3 border-l-[3px] border-l-[var(--color-accent)] rounded-r-lg overflow-hidden',
        isDark ? 'bg-[var(--color-dark-hover)]' : 'bg-[var(--color-light-surface)] border border-[var(--color-light-border)] border-l-[3px] border-l-[var(--color-accent)]',
      ].join(' ')}
    >
      <table className="w-full text-xs">
        <tbody>
          {entries.map(([key, val]) => (
            <tr
              key={key}
              className={
                isDark
                  ? 'border-t border-[var(--color-dark-border)]'
                  : 'border-t border-[var(--color-light-border)]'
              }
            >
              <td
                className={[
                  'px-3 py-1.5 font-medium whitespace-nowrap',
                  isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]',
                ].join(' ')}
              >
                {key.replace(/_/g, ' ')}
              </td>
              <td
                className={[
                  'px-3 py-1.5',
                  isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]',
                ].join(' ')}
              >
                {formatValue(val)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(val: unknown): string {
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object' && val !== null) {
    return JSON.stringify(val)
      .replace(/[{}"]/g, '')
      .replace(/,/g, ', ')
      .replace(/:/g, ': ');
  }
  return String(val);
}
