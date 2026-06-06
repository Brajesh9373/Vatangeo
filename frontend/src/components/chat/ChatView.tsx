import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ChatHeader from './ChatHeader';
import WelcomeScreen from './WelcomeScreen';
import TypingIndicator from './TypingIndicator';
import QuoteForm from './QuoteForm';
import { useChat } from '../../context/ChatContext';
import type { Message } from '../../types';
import type { View } from '../layout/Sidebar';

interface Props {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onFindByNeed: () => void;
  onStop: () => void;
  onDismissError: () => void;
  onNavigate: (view: View) => void;
  onLoadSession: (id: string) => void;
}

export default function ChatView({
  messages,
  isStreaming,
  error,
  onSend,
  onFindByNeed,
  onStop,
  onDismissError,
  onNavigate,
  onLoadSession,
}: Props) {
  const { state } = useChat();
  const hasMessages = messages.length > 0;
  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator =
    isStreaming && (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content);
  const showQuoteForm = state.quoteForm !== null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ChatHeader />

      {hasMessages ? (
        <MessageList />
      ) : (
        <WelcomeScreen
          onPrompt={onSend}
          onFindByNeed={onFindByNeed}
          onNavigate={onNavigate}
          onLoadSession={onLoadSession}
        />
      )}

      {showQuoteForm ? (
        <div className="px-4 pb-3 flex flex-col gap-3">
          <QuoteForm state={state.quoteForm!} />
        </div>
      ) : null}

      {showTypingIndicator ? <TypingIndicator /> : null}

      <ChatInput onSend={onSend} disabled={isStreaming} isStreaming={isStreaming} onStop={onStop} />

      {error ? (
        <div className="px-4 py-2 text-xs text-center animate-fade-in text-[var(--color-error)] bg-[var(--color-error-subtle)]">
          {error}
          <button onClick={onDismissError} className="ml-2 underline">Dismiss</button>
        </div>
      ) : null}
    </div>
  );
}
