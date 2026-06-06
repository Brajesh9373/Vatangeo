import { Plus, MessageSquare, LayoutGrid, GitCompare, Sparkles, FileText, Plug, Moon, Sun, Settings, X } from 'lucide-react';
import { Logo } from '../shared/Logo';
import { useTheme } from '../../context/ThemeContext';
import { useConfig } from '../../context/ConfigContext';
import { useHistory } from '../../context/HistoryContext';
import { useChat } from '../../context/ChatContext';
import { relativeTime } from '../../lib/format';
import type { SavedSession } from '../../lib/history';

export type View = 'chat' | 'catalog' | 'compare' | 'recommendations' | 'receipts' | 'connectors';

interface Props {
  activeView: View;
  sessions: SavedSession[];
  currentSessionId: string;
  receiptCount: number;
  onNavigate: (view: View) => void;
  onLoadSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onConfigToggle: () => void;
}

const NAV_ITEMS = [
  { view: 'chat' as View, icon: MessageSquare, label: 'New Chat' },
  { view: 'catalog' as View, icon: LayoutGrid, label: 'Browse Servers' },
  { view: 'compare' as View, icon: GitCompare, label: 'Compare Models' },
  { view: 'receipts' as View, icon: FileText, label: 'Quotations' },
  { view: 'recommendations' as View, icon: Sparkles, label: 'Recommendations' },
  { view: 'connectors' as View, icon: Plug, label: 'Connectors' },
];

export default function Sidebar({
  activeView,
  sessions,
  currentSessionId,
  receiptCount,
  onNavigate,
  onLoadSession,
  onDeleteSession,
  onConfigToggle,
}: Props) {
  const { theme, toggleTheme } = useTheme();
  const { state } = useChat();
  const isDark = theme === 'dark';

  const hasActiveMessages = state.messages.length > 0;
  const asideCls = [
    'w-[240px] shrink-0 flex flex-col border-r h-full',
    isDark ? 'bg-[var(--color-dark-surface)] border-[var(--color-dark-border)]'
           : 'bg-[var(--color-light-surface)] border-[var(--color-light-border)]',
  ].join(' ');

  return (
    <aside className={asideCls}>
      <div className="px-4 pt-5 pb-4 flex items-center justify-center">
        <Logo size="xl" />
      </div>

      <div className="px-3 mb-3">
        <button
          onClick={() => onNavigate('chat')}
          className={[
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
            isDark
              ? 'border-[var(--color-dark-border)] text-[var(--color-dark-text)] hover:bg-[var(--color-dark-hover)]'
              : 'border-[var(--color-light-border)] text-[var(--color-light-text)] bg-[var(--color-light-elevated)] hover:bg-[var(--color-accent-subtle)]',
          ].join(' ')}
        >
          <Plus size={14} />
          New Chat
        </button>
      </div>

      <nav className="flex-1 px-2 py-1 flex flex-col gap-0.5 overflow-y-auto custom-scroll min-h-0">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.view;
          const showCount = item.view === 'receipts' && receiptCount > 0;
          return (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              className={[
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                isActive
                  ? 'bg-[var(--color-brand-subtle)] text-[var(--color-brand)] border-l-2 border-[var(--color-brand)]'
                  : isDark
                    ? 'text-[var(--color-dark-muted)] hover:bg-[var(--color-dark-hover)]'
                    : 'text-[var(--color-light-muted)] hover:bg-[var(--color-light-hover)]',
              ].join(' ')}
            >
              <item.icon size={16} />
              <span className="flex-1">{item.label}</span>
              {showCount ? (
                <span className={['text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                  isActive
                    ? 'bg-[var(--color-brand)] text-white'
                    : isDark
                      ? 'bg-[var(--color-dark-hover-strong)] text-[var(--color-dark-muted)]'
                      : 'bg-[var(--color-accent-muted)] text-[var(--color-light-muted)]'].join(' ')}>
                  {receiptCount}
                </span>
              ) : null}
            </button>
          );
        })}

        <div className="mt-4 pt-3 border-t border-[var(--color-light-border)] dark:border-[var(--color-dark-border)]">
          <div className={['px-3 mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider', isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
            <span>History</span>
            {sessions.length > 0 ? <span>{sessions.length}</span> : null}
          </div>

          {sessions.length === 0 ? (
            <div className={['px-3 py-2 text-xs', isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
              No past conversations
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {sessions.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  isActive={s.id === currentSessionId}
                  isDark={isDark}
                  onLoad={onLoadSession}
                  onDelete={onDeleteSession}
                />
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className={['px-2 py-3 border-t flex items-center gap-1', isDark ? 'border-[var(--color-dark-border)]' : 'border-[var(--color-light-border)]'].join(' ')}>
        <button
          onClick={toggleTheme}
          className={['p-2 rounded-lg transition-colors', isDark ? 'text-[var(--color-dark-muted)] hover:bg-[var(--color-dark-hover-strong)]' : 'text-[var(--color-light-muted)] hover:bg-[var(--color-light-hover)]'].join(' ')}
          title="Toggle theme"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </aside>
  );
}

function SessionItem({
  session,
  isActive,
  isDark,
  onLoad,
  onDelete,
}: {
  session: SavedSession;
  isActive: boolean;
  isDark: boolean;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const wrapperCls = [
    'group flex items-center gap-1 rounded-lg',
    isActive
      ? 'bg-[var(--color-brand-subtle)]'
      : isDark
        ? 'hover:bg-[var(--color-dark-hover)]'
        : 'hover:bg-[var(--color-light-hover)]',
  ].join(' ');

  const titleCls = [
    'text-xs font-medium truncate',
    isActive
      ? 'text-[var(--color-brand)]'
      : isDark
        ? 'text-[var(--color-dark-text)]'
        : 'text-[var(--color-light-text)]',
  ].join(' ');

  const metaCls = [
    'text-[10px] truncate',
    isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]',
  ].join(' ');

  const deleteCls = [
    'shrink-0 p-1 rounded transition-opacity',
    isDark
      ? 'text-[var(--color-dark-muted)] hover:text-[var(--color-error)]'
      : 'text-[var(--color-light-muted)] hover:text-[var(--color-error)]',
    'opacity-0 group-hover:opacity-100',
    isActive ? 'opacity-100' : '',
  ].join(' ');

  return (
    <div className={wrapperCls}>
      <button
        onClick={() => onLoad(session.id)}
        className="flex-1 min-w-0 text-left px-3 py-2"
        title={session.title}
      >
        <div className={titleCls}>{session.title}</div>
        <div className={metaCls}>{relativeTime(session.updatedAt)}</div>
      </button>
      <button
        onClick={() => onDelete(session.id)}
        className={deleteCls}
        title="Delete conversation"
        aria-label="Delete conversation"
      >
        <X size={12} />
      </button>
    </div>
  );
}
