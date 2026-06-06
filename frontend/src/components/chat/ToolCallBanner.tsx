import { Database } from 'lucide-react';

interface Props {
  toolName: string | null;
}

const LABELS: Record<string, string> = {
  list_products: 'Fetching product catalog…',
  get_product_spec: 'Looking up specifications…',
  find_by_requirement: 'Searching products…',
  compare_products: 'Comparing products…',
};

export default function ToolCallBanner({ toolName }: Props) {
  if (!toolName) return null;

  return (
    <div className="flex items-center gap-2 py-2 px-4 animate-fade-in relative z-10">
      <div className={[
        'flex items-center gap-2 px-3 py-1.5 rounded-lg border',
        'bg-[var(--color-accent-subtle)] border-[var(--color-accent)]/20',
        'dark:bg-[var(--color-accent-subtle)] dark:border-[var(--color-accent)]/20',
      ].join(' ')}>
        <Database size={13} className="text-[var(--color-accent)] animate-pulse-accent" />
        <span className="text-xs text-[var(--color-accent)] font-medium">
          {LABELS[toolName] || `Running ${toolName}…`}
        </span>
      </div>
    </div>
  );
}
