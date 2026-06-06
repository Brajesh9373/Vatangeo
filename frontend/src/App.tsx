import { useState, useCallback, useRef, useMemo } from 'react';
import Sidebar, { type View } from './components/layout/Sidebar';
import ChatView from './components/chat/ChatView';
import CatalogView from './components/catalog/CatalogView';
import CompareView from './components/compare/CompareView';
import RecommendationsView from './components/recommendations/RecommendationsView';
import ReceiptsView from './components/receipts/ReceiptsView';
import ConnectorsView from './components/connectors/ConnectorsView';
import ConfigPanel from './components/config/ConfigPanel';
import { useTheme } from './context/ThemeContext';
import { useChat } from './context/ChatContext';
import { useHistory } from './context/HistoryContext';
import { streamChat } from './lib/api';
import { genId } from './lib/format';
import type { Message, QuoteFormDefaults } from './types';

export default function App() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { state, dispatch } = useChat();
  const { sessions, upsertSession, deleteSession } = useHistory();
  const [activeView, setActiveView] = useState<View>('chat');
  const [configOpen, setConfigOpen] = useState(false);

  // Count unique receipts across current session + history. Used for the
  // sidebar badge so the user can see at a glance how many quotations exist.
  const receiptCount = useMemo(() => {
    const seen = new Set<string>();
    for (const m of state.messages) {
      for (const tr of m.toolResults ?? []) {
        if (tr.tool === 'generate_quote') {
          const r = tr.result as Record<string, unknown> | null;
          if (r && typeof r.receipt_id === 'string') seen.add(r.receipt_id);
        }
      }
    }
    for (const s of sessions) {
      for (const m of s.messages) {
        for (const tr of m.toolResults ?? []) {
          if (tr.tool === 'generate_quote') {
            const r = tr.result as Record<string, unknown> | null;
            if (r && typeof r.receipt_id === 'string') seen.add(r.receipt_id);
          }
        }
      }
    }
    return seen.size;
  }, [state.messages, sessions]);

  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = state.messages;
  const sessionIdRef = useRef<string>(state.currentSessionId);
  sessionIdRef.current = state.currentSessionId;
  const sessionCreatedAtRef = useRef<number>(state.currentSessionCreatedAt);
  sessionCreatedAtRef.current = state.currentSessionCreatedAt;
  const abortControllerRef = useRef<AbortController | null>(null);

  const appendMessage = useCallback((msg: Message) => {
    dispatch({ type: 'ADD_MESSAGE', payload: msg });
  }, [dispatch]);

  const runChat = useCallback(async (
    queryMessages: { role: 'user' | 'assistant'; content: string }[],
    userMessage: Message | null,
  ) => {
    if (userMessage) appendMessage(userMessage);

    const assistantId = genId();
    appendMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolResults: [],
    });

    dispatch({ type: 'START_STREAMING' });
    dispatch({ type: 'START_TOOL_CALL', payload: 'processing' });

    let firstTextSeen = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamChat(queryMessages, (event) => {
        if (event.type === 'text') {
          if (!firstTextSeen) {
            firstTextSeen = true;
            dispatch({ type: 'END_TOOL_CALL' });
          }
          dispatch({ type: 'STREAM_TOKEN', payload: event.text });
        } else if (event.type === 'tool_result') {
          dispatch({
            type: 'APPEND_TOOL_RESULT',
            payload: {
              tool: event.name,
              args: event.args,
              result: event.result,
            },
          });
          dispatch({ type: 'START_TOOL_CALL', payload: event.name });

          // When the LLM calls generate_quote, the tool returns
          // {status: 'form_opened', defaults: {...}}. Open the quote
          // form pre-filled with those defaults.
          if (event.name === 'generate_quote') {
            const r = event.result as Record<string, unknown> | null;
            if (r && r.status === 'form_opened' && r.defaults && typeof r.defaults === 'object') {
              const d = r.defaults as Record<string, unknown>;
              const defaults: QuoteFormDefaults = {
                model: String(d.model ?? ''),
                quantity: Number(d.quantity ?? 1) || 1,
                memory_gb: Number(d.memory_gb ?? 0) || 0,
                storage_gb: Number(d.storage_gb ?? 0) || 0,
                gpu_count: Number(d.gpu_count ?? 0) || 0,
                use_case: String(d.use_case ?? ''),
              };
              dispatch({ type: 'OPEN_QUOTE_FORM', payload: defaults });
            }
          }
        } else if (event.type === 'error') {
          dispatch({ type: 'SET_ERROR', payload: event.message || 'Chat error' });
        }
      }, controller.signal);
    } catch (e) {
      if (e instanceof Error && (e.name === 'AbortError' || e.message.toLowerCase().includes('aborted'))) {
        // User-initiated stop; no error to surface.
      } else {
        dispatch({ type: 'SET_ERROR', payload: e instanceof Error ? e.message : 'Something went wrong' });
      }
    } finally {
      abortControllerRef.current = null;
      dispatch({ type: 'STOP_STREAMING' });
      const msgs = messagesRef.current;
      if (msgs.length > 0) {
        upsertSession(sessionIdRef.current, msgs, sessionCreatedAtRef.current);
      }
    }
  }, [appendMessage, dispatch, upsertSession]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    dispatch({ type: 'STOP_STREAMING' });
  }, [dispatch]);

  const handleSend = useCallback((text: string) => {
    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const previous = messagesRef.current;
    const apiMessages = [
      ...previous.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: text },
    ];
    runChat(apiMessages, userMsg);
  }, [runChat]);

  const handleFindByNeed = useCallback(() => {
    const apiMessages = [
      { role: 'user' as const, content: 'I need help finding a server. Please ask me about my requirements.' },
    ];
    runChat(apiMessages, null);
  }, [runChat]);

  const handleNavigate = useCallback((view: View) => {
    if (view === 'chat') {
      if (messagesRef.current.length > 0) {
        upsertSession(sessionIdRef.current, messagesRef.current, sessionCreatedAtRef.current);
      }
      dispatch({ type: 'RESET' });
    }
    setActiveView(view);
  }, [dispatch, upsertSession]);

  const handleGetQuote = useCallback((model: string) => {
    if (activeView !== 'chat') {
      if (messagesRef.current.length > 0) {
        upsertSession(sessionIdRef.current, messagesRef.current, sessionCreatedAtRef.current);
      }
      dispatch({ type: 'RESET' });
      setActiveView('chat');
    }
    dispatch({
      type: 'OPEN_QUOTE_FORM',
      payload: {
        model,
        quantity: 1,
        memory_gb: 0,
        storage_gb: 0,
        gpu_count: 0,
        use_case: '',
      },
    });
  }, [activeView, dispatch, upsertSession]);

  const handleLoadSession = useCallback((id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    dispatch({
      type: 'LOAD_SESSION',
      payload: {
        id: session.id,
        createdAt: session.createdAt,
        messages: session.messages,
      },
    });
    setActiveView('chat');
  }, [dispatch, sessions]);

  const handleDeleteSession = useCallback((id: string) => {
    deleteSession(id);
    if (id === sessionIdRef.current) {
      dispatch({ type: 'RESET' });
    }
  }, [deleteSession, dispatch]);

  const handleRecommendationPrompt = useCallback((prompt: string) => {
    setActiveView('chat');
    if (messagesRef.current.length > 0) {
      upsertSession(sessionIdRef.current, messagesRef.current, sessionCreatedAtRef.current);
    }
    dispatch({ type: 'RESET' });
    handleSend(prompt);
  }, [dispatch, handleSend, upsertSession]);

  return (
    <div className={[
      'h-full flex flex-row',
      isDark ? 'bg-[var(--color-dark-bg)] text-[var(--color-dark-text)]' : 'bg-[var(--color-light-bg)] text-[var(--color-light-text)]',
    ].join(' ')}>
      <Sidebar
        activeView={activeView}
        sessions={sessions}
        currentSessionId={state.currentSessionId}
        receiptCount={receiptCount}
        onNavigate={handleNavigate}
        onLoadSession={handleLoadSession}
        onDeleteSession={handleDeleteSession}
        onConfigToggle={() => setConfigOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeView === 'chat' ? (
          <ChatView
            messages={state.messages}
            isStreaming={state.isStreaming}
            error={state.error}
            onSend={handleSend}
            onFindByNeed={handleFindByNeed}
            onStop={handleStop}
            onDismissError={() => dispatch({ type: 'CLEAR_ERROR' })}
            onNavigate={handleNavigate}
            onLoadSession={handleLoadSession}
          />
        ) : activeView === 'catalog' ? (
          <CatalogView onGetQuote={handleGetQuote} />
        ) : activeView === 'compare' ? (
          <CompareView />
        ) : activeView === 'receipts' ? (
          <ReceiptsView />
        ) : activeView === 'connectors' ? (
          <ConnectorsView />
        ) : (
          <RecommendationsView onUsePrompt={handleRecommendationPrompt} />
        )}
      </main>

      <ConfigPanel isOpen={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}
