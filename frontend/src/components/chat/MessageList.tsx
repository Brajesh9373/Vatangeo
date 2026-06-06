import { useEffect, useRef, memo } from 'react';
import { useChat } from '../../context/ChatContext';
import { Message } from './Message';

const MemoMessage = memo(Message);

export default function MessageList() {
  const { state } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = state.isStreaming;
  const messages = state.messages;
  const lastId = messages[messages.length - 1]?.id;

  // Scroll only when the last message or streaming state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastId, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto custom-scroll px-4 py-4 flex flex-col gap-3">
      {messages.map((msg, i) => (
        <MemoMessage key={msg.id} message={msg} isNew={i === messages.length - 1} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
