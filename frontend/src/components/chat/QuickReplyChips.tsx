import { Server, Phone } from 'lucide-react';

const CHIPS = [
  { id: 'servers', icon: Server, label: 'Server Specs' },
  { id: 'sales', icon: Phone, label: 'Contact Sales' },
];

interface Props {
  onSelect: (text: string) => void;
}

export default function QuickReplyChips({ onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2 px-1 animate-fade-in">
      {CHIPS.map((chip) => (
        <button
          key={chip.id}
          onClick={() => onSelect(chip.label)}
          className={[
            'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium',
            'border border-[var(--color-accent)] text-[var(--color-accent)]',
            'hover:bg-[var(--color-accent-subtle)] transition-colors',
          ].join(' ')}
        >
          <chip.icon size={12} />
          {chip.label}
        </button>
      ))}
    </div>
  );
}
