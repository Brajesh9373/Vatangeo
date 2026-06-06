import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  isDark: boolean;
}

const PROSE_BASE = [
  'prose prose-sm max-w-none',
  '[&_ul]:pl-4 [&_ol]:pl-4 [&_li]:mb-0.5 [&_strong]:font-semibold',
  '[&_table]:w-full [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:px-2 [&_td]:py-1',
].join(' ');

const PROSE_DARK = [
  '[&_pre]:bg-[var(--color-dark-bg)] [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-xs [&_pre]:overflow-x-auto',
  '[&_code]:text-xs [&_td]:border-t [&_td]:border-[var(--color-dark-border)]',
].join(' ');

const PROSE_LIGHT = [
  '[&_pre]:bg-[var(--color-light-surface)] [&_pre]:text-[var(--color-light-text-soft)] [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-[var(--color-light-border)]',
  '[&_code]:text-xs [&_td]:border-t [&_td]:border-[var(--color-light-border)]',
].join(' ');

export default function MarkdownView({ content, isDark }: Props) {
  return (
    <div className={[PROSE_BASE, isDark ? PROSE_DARK : PROSE_LIGHT].join(' ')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
