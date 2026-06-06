import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Message } from '../types';
import {
  loadHistory,
  saveHistory,
  deriveTitle,
  type SavedSession,
} from '../lib/history';

interface HistoryCtx {
  sessions: SavedSession[];
  upsertSession: (id: string, messages: Message[], createdAt: number) => void;
  deleteSession: (id: string) => void;
  getSession: (id: string) => SavedSession | undefined;
}

const HistoryContext = createContext<HistoryCtx | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SavedSession[]>(() => loadHistory());

  useEffect(() => {
    saveHistory(sessions);
  }, [sessions]);

  const upsertSession = (id: string, messages: Message[], createdAt: number) => {
    if (messages.length === 0) return;
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const updated: SavedSession = {
        id,
        title: deriveTitle(messages),
        createdAt,
        updatedAt: Date.now(),
        messages,
      };
      if (idx === -1) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const getSession = (id: string) => sessions.find((s) => s.id === id);

  return (
    <HistoryContext.Provider value={{ sessions, upsertSession, deleteSession, getSession }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory(): HistoryCtx {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be inside HistoryProvider');
  return ctx;
}
