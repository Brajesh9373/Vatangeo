import { lazy, Suspense, memo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { formatTime } from '../../lib/format';
import type { Message as MessageType } from '../../types';
import { Sparkles, User as UserIcon } from 'lucide-react';
import ToolResultView from './ToolResultView';

const MarkdownView = lazy(() => import('./MarkdownView'));

interface Props {
  message: MessageType;
  isNew?: boolean;
}

const MemoMarkdownView = memo(MarkdownView);

function MessageBase({ message, isNew }: Props) {
  const { theme } = useTheme();
  const isUser = message.role === 'user';
  const isDark = theme === 'dark';

  if (isUser) {
    return (
      <div className={['flex gap-3 max-w-[80%] self-end flex-row-reverse animate-fade-in', isNew ? 'animate-slide-up' : ''].join(' ')}>
        <div className={['w-8 h-8 rounded-full flex items-center justify-center shrink-0', isDark ? 'bg-[var(--color-brand)]/20' : 'bg-[var(--color-brand)] text-white'].join(' ')}>
          <UserIcon size={14} className={isDark ? 'text-[var(--color-brand)]' : 'text-white'} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="px-4 py-2.5 text-sm leading-relaxed rounded-2xl rounded-br-md bg-[var(--color-accent)] text-[var(--color-light-text)] shadow-sm">
            <p className="font-medium whitespace-pre-wrap">{message.content}</p>
          </div>
          <span className="text-[10px] text-[var(--color-light-muted)] dark:text-[var(--color-dark-muted)]">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={['flex gap-3 max-w-[85%] self-start animate-fade-in', isNew ? 'animate-slide-up' : ''].join(' ')}>
      <div className="w-8 h-8 rounded-full bg-[var(--color-brand)] flex items-center justify-center shrink-0">
        <Sparkles size={14} className="text-white" />
      </div>
      <div className="flex flex-col items-start gap-2 min-w-0 flex-1">
        {message.content ? (
          <div className={['px-4 py-2.5 text-sm leading-relaxed rounded-2xl rounded-bl-md shadow-sm max-w-full', isDark ? 'bg-[var(--color-dark-surface)] text-[var(--color-dark-text)] border border-[var(--color-dark-border)]' : 'bg-[var(--color-light-elevated)] text-[var(--color-light-text)] border border-[var(--color-light-border)]'].join(' ')}>
            <Suspense fallback={<p className="whitespace-pre-wrap">{message.content}</p>}>
              <MemoMarkdownView content={message.content} isDark={isDark} />
            </Suspense>
          </div>
        ) : null}
        {message.toolResults?.map((tr, i) => (
          <ToolResultView key={i} tool={tr.tool} args={tr.args} result={tr.result} />
        ))}
        <span className="text-[10px] text-[var(--color-light-muted)] dark:text-[var(--color-dark-muted)]">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}

export const Message = memo(MessageBase);
