import { useHistory } from '../../context/HistoryContext';
import { useTheme } from '../../context/ThemeContext';
import { Logo } from '../shared/Logo';
import { relativeTime } from '../../lib/format';
import {
  Server,
  GitCompare,
  Sparkles,
  Search,
  ArrowRight,
  MessageSquare,
  Database,
  Cpu,
  HardDrive,
  Zap,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { View } from '../layout/Sidebar';

interface Props {
  onPrompt: (text: string) => void;
  onFindByNeed: () => void;
  onNavigate: (view: View) => void;
  onLoadSession: (id: string) => void;
}

type ActionId = 'browse' | 'compare' | 'recs' | 'find';

interface QuickAction {
  id: ActionId;
  icon: typeof Server;
  title: string;
  desc: string;
  view: View | null;
  prompt: string | null;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'browse',
    icon: Server,
    title: 'Browse Catalog',
    desc: 'See all Vantageo servers',
    view: 'catalog',
    prompt: null,
  },
  {
    id: 'compare',
    icon: GitCompare,
    title: 'Compare Models',
    desc: 'Side-by-side specs',
    view: 'compare',
    prompt: null,
  },
  {
    id: 'recs',
    icon: Sparkles,
    title: 'Recommendations',
    desc: 'Find your ideal server',
    view: 'recommendations',
    prompt: null,
  },
  {
    id: 'find',
    icon: Search,
    title: 'Find by Need',
    desc: 'Tell us your workload',
    view: null,
    prompt: null,
  },
];

const SUGGESTED_PROMPTS: string[] = [
  'What servers are in the Vantageo lineup?',
  'Compare 2240-RG and 2240-RM',
  'Recommend a server for AI inference',
  "What's the difference between 2240 and 2240-RG?",
  'Show me the 1240-RG specs',
  'I need a quote for 4 servers with 256GB RAM and 4TB storage',
];

interface Scenario {
  id: string;
  icon: typeof Sparkles;
  label: string;
  desc: string;
  prompt: string;
  accentVar: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'ai',
    icon: Sparkles,
    label: 'AI / ML',
    desc: 'GPU-ready for training & inference',
    prompt: 'Recommend a Vantageo server for AI training with GPUs',
    accentVar: 'var(--color-brand)',
  },
  {
    id: 'db',
    icon: Database,
    label: 'Database',
    desc: 'High memory, fast storage',
    prompt: 'I need a server for a high-throughput PostgreSQL database',
    accentVar: 'var(--color-link)',
  },
  {
    id: 'edge',
    icon: Cpu,
    label: 'Edge / Branch',
    desc: 'Compact for remote sites',
    prompt: 'Show me compact Vantageo servers for a branch office',
    accentVar: 'var(--color-success)',
  },
  {
    id: 'storage',
    icon: HardDrive,
    label: 'Storage Heavy',
    desc: 'Many bays, lots of capacity',
    prompt: 'I need a server with lots of drive bays for 200TB of storage',
    accentVar: 'var(--color-accent-hover)',
  },
];

export default function WelcomeScreen({ onPrompt, onFindByNeed, onNavigate, onLoadSession }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { sessions } = useHistory();
  const recent = sessions.slice(0, 3);

  const handleAction = (action: QuickAction) => {
    if (action.id === 'find') {
      onFindByNeed();
      return;
    }
    if (action.view) onNavigate(action.view);
  };

  const surface = isDark
    ? 'bg-[var(--color-dark-surface)] border-[var(--color-dark-border)]'
    : 'bg-[var(--color-light-elevated)] border-[var(--color-light-border)] shadow-sm';

  const muted = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  const text = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';

  return (
    <div className="flex-1 overflow-y-auto custom-scroll relative isolate">
      <AuroraBackground />

      <div className="relative max-w-3xl mx-auto px-6 pt-10 pb-16 flex flex-col items-center">
        <Hero isDark={isDark} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full mt-10">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              className={[
                'group relative flex flex-col gap-2.5 p-4 rounded-xl border text-left',
                'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                'hover:border-[var(--color-brand)]',
                surface,
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--color-brand-subtle)] text-[var(--color-brand)] group-hover:bg-[var(--color-brand)] group-hover:text-white transition-colors">
                  <action.icon size={18} />
                </div>
                <ArrowRight
                  size={14}
                  className={`${muted} opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all`}
                />
              </div>
              <div>
                <div className={`text-sm font-semibold ${text}`}>{action.title}</div>
                <div className={`text-[11px] mt-0.5 ${muted}`}>{action.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <SectionLabel label="Try asking" isDark={isDark} className="mt-12 self-start" />
        <div className="flex flex-wrap gap-2 w-full mt-3">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPrompt(prompt)}
              className={[
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium',
                'border transition-colors',
                isDark
                  ? 'border-[var(--color-dark-border)] bg-[var(--color-dark-surface)] text-[var(--color-dark-text)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]'
                  : 'border-[var(--color-light-border)] bg-white text-[var(--color-light-text)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]',
              ].join(' ')}
            >
              <Zap size={11} className="text-[var(--color-brand)]" />
              {prompt}
            </button>
          ))}
        </div>

        {recent.length > 0 ? (
          <>
            <SectionLabel
              label="Pick up where you left off"
              isDark={isDark}
              className="mt-12 self-start"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-3">
              {recent.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onLoadSession(s.id)}
                  className={[
                    'group flex flex-col gap-2 p-4 rounded-xl border text-left',
                    'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--color-brand)]',
                    surface,
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center bg-[var(--color-accent-subtle)] text-[var(--color-accent-hover)] shrink-0">
                      <MessageSquare size={13} />
                    </div>
                    <ArrowRight
                      size={13}
                      className={`${muted} opacity-0 group-hover:opacity-100 transition-opacity`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-medium ${text} truncate`}>{s.title}</div>
                    <div className={`text-[11px] mt-1 flex items-center gap-1 ${muted}`}>
                      <Clock size={10} />
                      <span>{relativeTime(s.updatedAt)}</span>
                      <span className="mx-1">·</span>
                      <span>
                        {s.messages.length} msg{s.messages.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <SectionLabel
              label="Explore a scenario"
              isDark={isDark}
              className="mt-12 self-start"
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full mt-3">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => onPrompt(scenario.prompt)}
                  className={[
                    'group relative flex flex-col gap-2 p-4 rounded-xl border text-left overflow-hidden',
                    'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                    surface,
                  ].join(' ')}
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at top left, ${scenario.accentVar}11, transparent 70%)`,
                    }}
                  />
                  <div
                    className="relative w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: `color-mix(in srgb, ${scenario.accentVar} 12%, transparent)`,
                      color: scenario.accentVar,
                    }}
                  >
                    <scenario.icon size={18} />
                  </div>
                  <div className="relative">
                    <div className={`text-sm font-semibold ${text}`}>{scenario.label}</div>
                    <div className={`text-[11px] mt-0.5 ${muted}`}>{scenario.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className={`mt-12 text-[11px] ${muted} flex items-center gap-1.5`}>
          <CheckCircle2 size={11} className="text-[var(--color-success)]" />
          Vantageo AI · connected and ready
        </div>
      </div>
    </div>
  );
}

function AuroraBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      <div
        className="absolute top-1/2 left-1/2 w-[100rem] h-[100rem] animate-conic-rotate"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(255, 0, 0, 0.03) 30deg, transparent 60deg, transparent 180deg, rgba(58, 143, 160, 0.045) 210deg, transparent 240deg, transparent 360deg)',
          maskImage: 'radial-gradient(circle, black 0%, transparent 50%)',
          WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 50%)',
        }}
      />
      <div
        className="absolute -top-40 -left-40 w-[42rem] h-[42rem] blur-3xl animate-aurora-1"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 0, 0, 0.14) 0%, transparent 65%)',
        }}
      />
      <div
        className="absolute -top-32 -right-40 w-[38rem] h-[38rem] blur-3xl animate-aurora-2"
        style={{
          background:
            'radial-gradient(circle, rgba(58, 143, 160, 0.18) 0%, transparent 65%)',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 w-[55rem] h-[28rem] blur-3xl animate-aurora-3"
        style={{
          background:
            'radial-gradient(circle, rgba(187, 213, 218, 0.16) 0%, transparent 65%)',
        }}
      />
      <div
        className="absolute -bottom-40 left-1/3 w-[40rem] h-[40rem] blur-3xl animate-aurora-4"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 0, 0, 0.10) 0%, transparent 65%)',
        }}
      />
    </div>
  );
}

function Hero({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative w-32 h-32 mb-5">
        <div
          className={[
            'absolute inset-0 rounded-2xl backdrop-blur-md border shadow-lg',
            isDark
              ? 'bg-white/5 border-white/10'
              : 'bg-white/70 border-white/50',
          ].join(' ')}
        />
        <div className="relative w-full h-full flex items-center justify-center p-2">
          <Logo size="2xl" />
        </div>
      </div>

      <h1
        className={[
          'text-3xl font-semibold tracking-tight',
          isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]',
        ].join(' ')}
      >
        Welcome to Vantageo
      </h1>
      <p
        className={[
          'text-sm mt-2 max-w-md',
          isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]',
        ].join(' ')}
      >
        Build, compare, and quote Vantageo servers with an AI that actually knows the catalog.
      </p>

      <div
        className={[
          'mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border backdrop-blur-sm',
          isDark
            ? 'border-white/10 bg-white/5 text-[var(--color-dark-muted)]'
            : 'border-white/50 bg-white/60 text-[var(--color-light-muted)]',
        ].join(' ')}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--color-success)]" />
        </span>
        AI assistant online
      </div>
    </div>
  );
}

function SectionLabel({ label, isDark, className = '' }: { label: string; isDark: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className={`text-[11px] font-semibold uppercase tracking-wider ${
          isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'
        }`}
      >
        {label}
      </span>
      <div
        className={`flex-1 h-px ${
          isDark ? 'bg-[var(--color-dark-border)]' : 'bg-[var(--color-light-border)]'
        }`}
      />
    </div>
  );
}
