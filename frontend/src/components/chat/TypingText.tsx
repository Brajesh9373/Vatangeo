import { useState, useEffect, useRef, type ReactNode } from 'react';

interface Props {
  content: string;
  isStreaming: boolean;
  children: (text: string, isTyping: boolean) => ReactNode;
}

export default function TypingText({ content, isStreaming, children }: Props) {
  const [displayed, setDisplayed] = useState('');
  const targetRef = useRef('');
  const [done, setDone] = useState(false);

  targetRef.current = content;

  useEffect(() => {
    if (!isStreaming) return;

    const id = setInterval(() => {
      setDisplayed((prev) => {
        const target = targetRef.current;
        if (prev.length >= target.length) {
          clearInterval(id);
          return prev;
        }
        const next = Math.min(prev.length + 1, target.length);
        return target.slice(0, next);
      });
    }, 18);

    return () => clearInterval(id);
  }, [isStreaming]);

  // When streaming ends, flush remaining text instantly.
  useEffect(() => {
    if (!isStreaming && displayed !== content) {
      setDisplayed(content);
      setDone(true);
    }
  }, [isStreaming, content, displayed]);

  // Reset done flag when new content starts streaming.
  useEffect(() => {
    if (isStreaming) setDone(false);
  }, [isStreaming]);

  const isTyping = isStreaming && displayed.length < content.length;
  return <>{children(displayed, isTyping)}</>;
}
