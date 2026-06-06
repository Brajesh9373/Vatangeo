import type { Message } from '../types';

export interface SavedSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

const STORAGE_KEY = 'vantageo:history';

export function loadHistory(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSession);
  } catch {
    return [];
  }
}

export function saveHistory(sessions: SavedSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Failed to save chat history:', e);
  }
}

export function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim());
  const text = firstUser?.content?.trim() ?? '';
  if (!text) return 'New conversation';
  return text.length > 50 ? text.slice(0, 47) + '...' : text;
}

function isValidSession(s: unknown): s is SavedSession {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.createdAt === 'number' &&
    typeof o.updatedAt === 'number' &&
    Array.isArray(o.messages)
  );
}
