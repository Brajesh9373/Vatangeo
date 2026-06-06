import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { ChatState, ChatAction, Message, QuoteFormDefaults } from '../types';

function genSessionId(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function genFormId(): string {
  return `form-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const initialState: ChatState = {
  messages: [],
  isStreaming: false,
  isToolCalling: false,
  toolCallName: null,
  error: null,
  currentSessionId: genSessionId(),
  currentSessionCreatedAt: Date.now(),
  quoteForm: null,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload], error: null };
    case 'UPDATE_LAST_BOT': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: action.payload };
      }
      return { ...state, messages: msgs };
    }
    case 'STREAM_TOKEN': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + action.payload };
      }
      return { ...state, messages: msgs };
    }
    case 'APPEND_TOOL_RESULT': {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...last,
          toolResults: [...(last.toolResults ?? []), action.payload],
        };
      }
      return { ...state, messages: msgs };
    }
    case 'START_STREAMING':
      return { ...state, isStreaming: true };
    case 'STOP_STREAMING':
      return { ...state, isStreaming: false, isToolCalling: false, toolCallName: null };
    case 'START_TOOL_CALL':
      return { ...state, isToolCalling: true, toolCallName: action.payload };
    case 'END_TOOL_CALL':
      return { ...state, isToolCalling: false, toolCallName: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isStreaming: false, isToolCalling: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'RESET':
      return {
        ...initialState,
        currentSessionId: genSessionId(),
        currentSessionCreatedAt: Date.now(),
      };
    case 'LOAD_SESSION': {
      const { id, createdAt, messages } = action.payload;
      return {
        ...initialState,
        currentSessionId: id,
        currentSessionCreatedAt: createdAt,
        messages,
      };
    }
    case 'OPEN_QUOTE_FORM': {
      const defaults: QuoteFormDefaults = action.payload;
      return {
        ...state,
        quoteForm: {
          formId: genFormId(),
          defaults,
          isSubmitting: false,
          error: null,
        },
      };
    }
    case 'CLOSE_QUOTE_FORM':
      return { ...state, quoteForm: null };
    case 'SET_QUOTE_FORM_SUBMITTING':
      return state.quoteForm
        ? { ...state, quoteForm: { ...state.quoteForm, isSubmitting: action.payload } }
        : state;
    case 'SET_QUOTE_FORM_ERROR':
      return state.quoteForm
        ? { ...state, quoteForm: { ...state.quoteForm, error: action.payload } }
        : state;
    default:
      return state;
  }
}

interface ChatCtx {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
}

const ChatContext = createContext<ChatCtx | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  return (
    <ChatContext.Provider value={{ state, dispatch }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatCtx {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be inside ChatProvider');
  return ctx;
}
