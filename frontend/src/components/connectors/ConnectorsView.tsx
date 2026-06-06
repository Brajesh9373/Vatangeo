import { useState } from 'react';
import { Inbox, ChevronDown, Mail, Star, Paperclip, Search, Inbox as InboxIcon, Send, FileText } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { relativeTime, formatINR } from '../../lib/format';

type ConnectorId = 'outlook' | 'gmail';

interface Lead {
  id: string;
  fromName: string;
  fromEmail: string;
  company: string;
  subject: string;
  preview: string;
  receivedAt: number;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  intent: 'quote' | 'inquiry' | 'support' | 'rfp';
  estimatedValue?: number;
  model?: string;
}

interface Connector {
  id: ConnectorId;
  name: string;
  vendor: string;
  brandColor: string;
  brandColorSoft: string;
  accountEmail: string;
  status: 'connected' | 'syncing' | 'error';
  lastSyncAt: number;
  unreadCount: number;
  totalCount: number;
}

const CONNECTORS: Connector[] = [
  {
    id: 'outlook',
    name: 'Outlook',
    vendor: 'Microsoft 365',
    brandColor: '#0078D4',
    brandColorSoft: 'rgba(0, 120, 212, 0.10)',
    accountEmail: 'sales@vantageo.com',
    status: 'connected',
    lastSyncAt: Date.now() - 2 * 60_000,
    unreadCount: 12,
    totalCount: 47,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    vendor: 'Google Workspace',
    brandColor: '#EA4335',
    brandColorSoft: 'rgba(234, 67, 53, 0.10)',
    accountEmail: 'leads@vantageo.com',
    status: 'connected',
    lastSyncAt: Date.now() - 5 * 60_000,
    unreadCount: 8,
    totalCount: 31,
  },
];

// Mock lead inbox — preview data only, not connected to real mail APIs.
const LEADS: Record<ConnectorId, Lead[]> = {
  outlook: [
    {
      id: 'ol-1',
      fromName: 'Vikram Singh',
      fromEmail: 'vikram.singh@tcs.com',
      company: 'Tata Consultancy Services',
      subject: 'Re: AI server requirement for our Bangalore DC',
      preview: 'Hi team, following up on our earlier conversation. We need 4× 2240-RG units with dual GPUs, 512GB RAM each, for a new inference cluster. Could you share a formal quote with delivery timeline?',
      receivedAt: Date.now() - 14 * 60_000,
      isUnread: true,
      isStarred: true,
      hasAttachment: true,
      intent: 'quote',
      estimatedValue: 96_00_000,
      model: '2240-RG',
    },
    {
      id: 'ol-2',
      fromName: 'Aisha Khan',
      fromEmail: 'aisha.khan@hdfcbank.com',
      company: 'HDFC Bank',
      subject: 'GPU server inquiry — fraud detection workload',
      preview: 'We are evaluating GPU-accelerated servers for our real-time fraud detection pipeline. Need configuration advice and indicative pricing for 8 units.',
      receivedAt: Date.now() - 47 * 60_000,
      isUnread: true,
      isStarred: false,
      hasAttachment: false,
      intent: 'inquiry',
      estimatedValue: 1_92_00_000,
      model: '2240-RG',
    },
    {
      id: 'ol-3',
      fromName: 'Ramesh Pillai',
      fromEmail: 'ramesh.pillai@ril.com',
      company: 'Reliance Industries',
      subject: 'RFP: Enterprise storage server — 2240-RM',
      preview: 'Please find attached the RFP for our storage tier refresh. We are looking at 12 units of the 2240-RM with maximum drive bays. Submission deadline is 12 Jun.',
      receivedAt: Date.now() - 2 * 60 * 60_000,
      isUnread: true,
      isStarred: true,
      hasAttachment: true,
      intent: 'rfp',
      estimatedValue: 86_00_000,
      model: '2240-RM',
    },
    {
      id: 'ol-4',
      fromName: 'Neha Gupta',
      fromEmail: 'neha.gupta@icicibank.com',
      company: 'ICICI Bank',
      subject: 'Quotation request — 6× 2240 units for core banking',
      preview: 'Could you send a quotation for 6× 2240 dual-socket servers, 256GB RAM, 4TB NVMe each? We have a budget of ₹4 Cr for this procurement.',
      receivedAt: Date.now() - 4 * 60 * 60_000,
      isUnread: false,
      isStarred: false,
      hasAttachment: false,
      intent: 'quote',
      estimatedValue: 4_00_00_000,
      model: '2240',
    },
    {
      id: 'ol-5',
      fromName: 'Sandeep Joshi',
      fromEmail: 'sandeep.joshi@wipro.com',
      company: 'Wipro Limited',
      subject: 'Edge deployment — 1U servers for 50 branch offices',
      preview: 'We need rugged 1U rack servers for our branch rollout. Looking at 1240-RG. Please confirm availability and volume pricing.',
      receivedAt: Date.now() - 9 * 60 * 60_000,
      isUnread: false,
      isStarred: false,
      hasAttachment: false,
      intent: 'inquiry',
      estimatedValue: 1_90_00_000,
      model: '1240-RG',
    },
    {
      id: 'ol-6',
      fromName: 'Karthik Iyer',
      fromEmail: 'karthik.iyer@ltimindtree.com',
      company: 'LTI Mindtree',
      subject: 'Support ticket — 2240-RE warranty extension',
      preview: 'Our 2240-RE units (purchase order PO-2024-8832) are nearing end of standard warranty. Please share options for 3-year extension.',
      receivedAt: Date.now() - 26 * 60 * 60_000,
      isUnread: false,
      isStarred: false,
      hasAttachment: false,
      intent: 'support',
    },
  ],
  gmail: [
    {
      id: 'gm-1',
      fromName: 'Daniel D\'Souza',
      fromEmail: 'daniel.dsouza@infosys.com',
      company: 'Infosys',
      subject: '2240-RG configuration for ML training cluster',
      preview: 'Hello, we are setting up an ML training cluster and would like to know if the 2240-RG supports 4× NVIDIA L4 GPUs in a single chassis. Also need a quote for 3 units.',
      receivedAt: Date.now() - 22 * 60_000,
      isUnread: true,
      isStarred: true,
      hasAttachment: false,
      intent: 'quote',
      estimatedValue: 72_00_000,
      model: '2240-RG',
    },
    {
      id: 'gm-2',
      fromName: 'Priya Menon',
      fromEmail: 'priya.menon@wipro.com',
      company: 'Wipro Limited',
      subject: 'Storage server inquiry',
      preview: 'We have a data archiving workload that needs high-capacity storage servers. Could you suggest the right model from your catalog and provide indicative pricing?',
      receivedAt: Date.now() - 1 * 60 * 60_000,
      isUnread: true,
      isStarred: false,
      hasAttachment: true,
      intent: 'inquiry',
      estimatedValue: 45_00_000,
      model: '2240-RM',
    },
    {
      id: 'gm-3',
      fromName: 'Arjun Reddy',
      fromEmail: 'arjun.reddy@techmahindra.com',
      company: 'Tech Mahindra',
      subject: 'Quote needed — 10× 2240 units for our Hyderabad DC',
      preview: 'Hi team, we have a project kicking off in 3 weeks. Need formal quote for 10× Vantageo 2240 with 128GB RAM, 2TB NVMe, dual PSU. Standard warranty please.',
      receivedAt: Date.now() - 3 * 60 * 60_000,
      isUnread: true,
      isStarred: false,
      hasAttachment: false,
      intent: 'quote',
      estimatedValue: 85_00_000,
      model: '2240',
    },
    {
      id: 'gm-4',
      fromName: 'Meera Krishnan',
      fromEmail: 'meera.k@nestle.in',
      company: 'Nestlé India',
      subject: 'SAP HANA deployment — server sizing help',
      preview: 'We are migrating our SAP HANA instance and need guidance on the right Vantageo configuration. Memory is the priority. Could we schedule a call this week?',
      receivedAt: Date.now() - 6 * 60 * 60_000,
      isUnread: false,
      isStarred: true,
      hasAttachment: false,
      intent: 'inquiry',
      estimatedValue: 60_00_000,
      model: '2240-RM',
    },
    {
      id: 'gm-5',
      fromName: 'Rohit Verma',
      fromEmail: 'rohit.verma@hcl.com',
      company: 'HCL Technologies',
      subject: 'Quote revision — additional 4 units',
      preview: 'Adding 4 more units to the existing quotation Q-2026-0412. Same configuration as before. Please issue a revised quote.',
      receivedAt: Date.now() - 14 * 60 * 60_000,
      isUnread: false,
      isStarred: false,
      hasAttachment: false,
      intent: 'quote',
      estimatedValue: 28_00_000,
      model: '2240-RG',
    },
    {
      id: 'gm-6',
      fromName: 'Anjali Bhatt',
      fromEmail: 'anjali.bhatt@adityabirla.com',
      company: 'Aditya Birla Group',
      subject: 'RFI — sustainable data center hardware',
      preview: 'We are exploring eco-friendly server options for our new green DC. Can you share the sustainability certifications and power-efficiency specs of your 2240 family?',
      receivedAt: Date.now() - 38 * 60 * 60_000,
      isUnread: false,
      isStarred: false,
      hasAttachment: false,
      intent: 'rfp',
      model: '2240-RG',
    },
  ],
};

export default function ConnectorsView() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [openId, setOpenId] = useState<ConnectorId | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const containerCls = isDark ? 'bg-[var(--color-dark-bg)]' : 'bg-[var(--color-light-bg)]';
  const titleCls = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';
  const mutedCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';

  return (
    <div className={['flex-1 overflow-y-auto custom-scroll', containerCls].join(' ')}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className={['text-lg font-semibold', titleCls].join(' ')}>Connectors</h2>
            <p className={['text-xs mt-1', mutedCls].join(' ')}>
              Unified inbox for sales leads across your email providers.
            </p>
          </div>
          <span className={['text-[10px] font-semibold px-2 py-1 rounded uppercase tracking-wider',
            isDark ? 'bg-[var(--color-accent-muted)] text-[var(--color-dark-muted)]'
                   : 'bg-[var(--color-accent-subtle)] text-[var(--color-light-muted)]'].join(' ')}>
            Preview
          </span>
        </div>

        <p className={['text-[10px] mb-6 italic', mutedCls].join(' ')}>
          Preview mode — sample data only. No real email account is connected.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CONNECTORS.map((c) => (
            <ConnectorCard
              key={c.id}
              connector={c}
              isOpen={openId === c.id}
              onToggle={() => {
                setOpenId((prev) => (prev === c.id ? null : c.id));
                setSelectedLead(null);
              }}
              onSelectLead={setSelectedLead}
              selectedLead={selectedLead}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConnectorCard({
  connector,
  isOpen,
  onToggle,
  onSelectLead,
  selectedLead,
}: {
  connector: Connector;
  isOpen: boolean;
  onToggle: () => void;
  onSelectLead: (l: Lead) => void;
  selectedLead: Lead | null;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const leads = LEADS[connector.id];
  const newCount = leads.filter((l) => l.isUnread).length;

  const cardCls = [
    'rounded-xl border overflow-hidden transition-all',
    isOpen
      ? isDark
        ? 'border-[var(--color-brand)] shadow-lg'
        : 'border-[var(--color-brand)] shadow-md'
      : isDark
        ? 'border-[var(--color-dark-border)] bg-[var(--color-dark-surface)] hover:border-[var(--color-dark-muted)]'
        : 'border-[var(--color-light-border)] bg-[var(--color-light-elevated)] shadow-sm hover:shadow-md',
  ].join(' ');

  const headerCls = isDark ? 'bg-[var(--color-dark-bg)]' : 'bg-[var(--color-light-bg)]';
  const textCls = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';
  const mutedCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';

  return (
    <div className={cardCls}>
      <button
        onClick={onToggle}
        className={['w-full flex items-center gap-3 p-4 text-left', headerCls].join(' ')}
        type="button"
      >
        <ConnectorLogo id={connector.id} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={['text-sm font-semibold', textCls].join(' ')}>
              {connector.name}
            </span>
            <StatusPill status={connector.status} />
          </div>
          <div className={['text-[11px] mt-0.5', mutedCls].join(' ')}>
            {connector.vendor} · {connector.accountEmail}
          </div>
          <div className={['text-[10px] mt-1.5 flex items-center gap-3', mutedCls].join(' ')}>
            <span>
              <span className="font-semibold text-[var(--color-brand)]">{newCount}</span> new
            </span>
            <span>
              <span className="font-semibold">{connector.totalCount}</span> total
            </span>
            <span>Synced {relativeTime(connector.lastSyncAt)}</span>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={['shrink-0 transition-transform', mutedCls, isOpen ? 'rotate-180' : ''].join(' ')}
        />
      </button>

      {isOpen ? (
        <div className="border-t" style={{ borderColor: 'var(--color-light-border)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-5 min-h-[420px]">
            {/* Lead list */}
            <div className={['lg:col-span-2 border-r overflow-y-auto custom-scroll max-h-[480px]',
              isDark ? 'border-[var(--color-dark-border)]' : 'border-[var(--color-light-border)]'].join(' ')}>
              {leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  brandColor={connector.brandColor}
                  isSelected={selectedLead?.id === lead.id}
                  onSelect={() => onSelectLead(lead)}
                />
              ))}
            </div>
            {/* Lead detail */}
            <div className="lg:col-span-3 overflow-y-auto custom-scroll max-h-[480px]">
              {selectedLead ? (
                <LeadDetail lead={selectedLead} brandColor={connector.brandColor} />
              ) : (
                <EmptyDetail isDark={isDark} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConnectorLogo({ id, size = 40 }: { id: ConnectorId; size?: number }) {
  if (id === 'outlook') {
    return (
      <div
        className="shrink-0 rounded-lg flex items-center justify-center"
        style={{ width: size, height: size, background: '#0078D4' }}
      >
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
          <rect x="2" y="6" width="14" height="12" rx="1" fill="white" />
          <path d="M2 6.5L9 12L16 6.5V17.5C16 17.7761 15.7761 18 15.5 18H2.5C2.22386 18 2 17.7761 2 17.5V6.5Z" fill="white" fillOpacity="0.85" />
          <path d="M16 6.5L9 12L2 6.5" stroke="#0078D4" strokeWidth="0.5" />
          <circle cx="18.5" cy="12" r="3" fill="white" />
          <path d="M16.5 11L18.5 12.5L20.5 11V13.5C20.5 13.7761 20.2761 14 20 14H17C16.7239 14 16.5 13.7761 16.5 13.5V11Z" fill="white" fillOpacity="0.7" />
        </svg>
      </div>
    );
  }
  // Gmail — red envelope with M
  return (
    <div
      className="shrink-0 rounded-lg flex items-center justify-center relative overflow-hidden"
      style={{ width: size, height: size, background: '#fff' }}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path d="M6 12L24 26L42 12V36C42 37.1046 41.1046 38 40 38H8C6.89543 38 6 37.1046 6 36V12Z" fill="#EA4335" />
        <path d="M6 12L24 26L42 12" stroke="#C5221F" strokeWidth="1.5" fill="none" />
        <path d="M6 12L22 24V38H8C6.89543 38 6 37.1046 6 36V12Z" fill="#FBBC05" />
        <path d="M42 12L26 24V38H40C41.1046 38 42 37.1046 42 36V12Z" fill="#34A853" />
        <path d="M6 12L24 26L42 12L40 10H8L6 12Z" fill="#EA4335" />
        <path d="M14 14L24 22L34 14" stroke="white" strokeWidth="1" fill="none" opacity="0.4" />
      </svg>
    </div>
  );
}

function StatusPill({ status }: { status: Connector['status'] }) {
  const map: Record<Connector['status'], { color: string; bg: string; label: string }> = {
    connected: { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.12)', label: 'Connected' },
    syncing:   { color: '#0078D4', bg: 'rgba(0, 120, 212, 0.12)',  label: 'Syncing' },
    error:     { color: '#D32F2F', bg: 'rgba(211, 47, 47, 0.12)',  label: 'Error' },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

function LeadRow({
  lead,
  brandColor,
  isSelected,
  onSelect,
}: {
  lead: Lead;
  brandColor: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const initials = lead.fromName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const rowCls = [
    'w-full text-left flex items-start gap-2.5 px-3 py-2.5 border-b transition-colors cursor-pointer',
    isSelected
      ? isDark
        ? 'bg-[var(--color-brand-subtle)]'
        : 'bg-[var(--color-accent-subtle)]'
      : isDark
        ? 'border-[var(--color-dark-border)] hover:bg-[var(--color-dark-hover)]'
        : 'border-[var(--color-light-border)] hover:bg-[var(--color-light-hover)]',
  ].join(' ');

  const titleCls = [
    'text-xs font-semibold truncate',
    lead.isUnread
      ? isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]'
      : isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]',
  ].join(' ');

  const previewCls = [
    'text-[10px] mt-0.5 line-clamp-2',
    isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]',
  ].join(' ');

  const metaCls = [
    'text-[9px] mt-1 flex items-center gap-1.5',
    isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]',
  ].join(' ');

  return (
    <button onClick={onSelect} className={rowCls} type="button">
      <div
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-white mt-0.5"
        style={{ background: brandColor }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={titleCls}>{lead.fromName}</span>
          <span className={['text-[9px] shrink-0', isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]'].join(' ')}>
            {relativeTime(lead.receivedAt)}
          </span>
        </div>
        <div className={['text-[10px] truncate', isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-text-soft)]'].join(' ')}>
          {lead.subject}
        </div>
        <p className={previewCls}>{lead.preview}</p>
        <div className={metaCls}>
          <IntentBadge intent={lead.intent} />
          {lead.hasAttachment ? <Paperclip size={9} /> : null}
          {lead.isStarred ? <Star size={9} fill="currentColor" className="text-yellow-500" /> : null}
        </div>
      </div>
    </button>
  );
}

function IntentBadge({ intent }: { intent: Lead['intent'] }) {
  const map: Record<Lead['intent'], { label: string; bg: string; color: string }> = {
    quote:    { label: 'Quote',    bg: 'rgba(255, 0, 0, 0.10)',  color: '#CC0000' },
    inquiry:  { label: 'Inquiry',  bg: 'rgba(0, 120, 212, 0.10)', color: '#0078D4' },
    rfp:      { label: 'RFP',      bg: 'rgba(106, 27, 154, 0.10)', color: '#6A1B9A' },
    support:  { label: 'Support',  bg: 'rgba(46, 125, 50, 0.10)', color: '#2E7D32' },
  };
  const s = map[intent];
  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
}

function LeadDetail({ lead, brandColor }: { lead: Lead; brandColor: string }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const textCls = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';
  const mutedCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  const borderCls = isDark ? 'border-[var(--color-dark-border)]' : 'border-[var(--color-light-border)]';

  const initials = lead.fromName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="p-5">
      <div className="flex items-start gap-3 pb-4 border-b" style={{ borderColor: 'var(--color-light-border)' }}>
        <div
          className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold text-white"
          style={{ background: brandColor }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={['text-sm font-semibold', textCls].join(' ')}>{lead.fromName}</h3>
            <IntentBadge intent={lead.intent} />
            {lead.isStarred ? <Star size={12} className="text-yellow-500" fill="currentColor" /> : null}
          </div>
          <div className={['text-[11px] mt-0.5', mutedCls].join(' ')}>
            {lead.company} · <a href={`mailto:${lead.fromEmail}`} className="hover:underline">{lead.fromEmail}</a>
          </div>
          <div className={['text-[10px] mt-1', mutedCls].join(' ')}>
            {relativeTime(lead.receivedAt)}
          </div>
        </div>
      </div>

      <div className="py-4">
        <h4 className={['text-sm font-semibold leading-snug', textCls].join(' ')}>
          {lead.subject}
        </h4>
        <p className={['text-xs leading-relaxed mt-3 whitespace-pre-wrap', textCls].join(' ')}>
          {lead.preview}
        </p>
        <p className={['text-xs leading-relaxed mt-3', mutedCls].join(' ')}>
          Regards,
          <br />
          {lead.fromName}
          <br />
          {lead.company}
        </p>
      </div>

      {(lead.model || lead.estimatedValue) ? (
        <div className={['mt-3 pt-3 border-t', borderCls].join(' ')}>
          <div className={['text-[10px] uppercase tracking-wider font-semibold mb-2', mutedCls].join(' ')}>
            Extracted details
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {lead.model ? (
              <div>
                <div className={mutedCls}>Product of interest</div>
                <div className={['font-semibold', textCls].join(' ')}>{lead.model}</div>
              </div>
            ) : null}
            {lead.estimatedValue ? (
              <div>
                <div className={mutedCls}>Indicative value</div>
                <div className={['font-semibold tabular-nums', textCls].join(' ')}>
                  {formatINR(lead.estimatedValue)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors"
        >
          <Send size={12} />
          Reply
        </button>
        <button
          type="button"
          className={['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
            isDark
              ? 'border-[var(--color-dark-border)] text-[var(--color-dark-text)] hover:bg-[var(--color-dark-hover)]'
              : 'border-[var(--color-light-border)] text-[var(--color-light-text)] hover:bg-[var(--color-light-hover)]'].join(' ')}
        >
          <FileText size={12} />
          Generate Quote
        </button>
        <button
          type="button"
          className={['inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
            isDark
              ? 'border-[var(--color-dark-border)] text-[var(--color-dark-muted)] hover:bg-[var(--color-dark-hover)]'
              : 'border-[var(--color-light-border)] text-[var(--color-light-muted)] hover:bg-[var(--color-light-hover)]'].join(' ')}
        >
          <InboxIcon size={12} />
          Archive
        </button>
      </div>
    </div>
  );
}

function EmptyDetail({ isDark }: { isDark: boolean }) {
  const mutedCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
      <Mail size={32} className={mutedCls} />
      <p className={['text-xs mt-3', mutedCls].join(' ')}>
        Select a lead to preview its contents.
      </p>
    </div>
  );
}
