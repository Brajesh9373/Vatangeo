export type ToolName = 'list_products' | 'get_product_spec' | 'find_by_requirement' | 'compare_products' | 'generate_quote';

export interface ToolResult {
  tool: ToolName | string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolResults?: ToolResult[];
}

export interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  isToolCalling: boolean;
  toolCallName: string | null;
  error: string | null;
  currentSessionId: string;
  currentSessionCreatedAt: number;
  quoteForm: QuoteFormState | null;
}

export interface QuoteFormState {
  formId: string;
  defaults: QuoteFormDefaults;
  isSubmitting: boolean;
  error: string | null;
}

export interface QuoteFormDefaults {
  model: string;
  quantity: number;
  memory_gb: number;
  storage_gb: number;
  gpu_count: number;
  use_case: string;
}

export type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_LAST_BOT'; payload: string }
  | { type: 'STREAM_TOKEN'; payload: string }
  | { type: 'APPEND_TOOL_RESULT'; payload: ToolResult }
  | { type: 'START_STREAMING' }
  | { type: 'STOP_STREAMING' }
  | { type: 'START_TOOL_CALL'; payload: string }
  | { type: 'END_TOOL_CALL' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' }
  | { type: 'LOAD_SESSION'; payload: { id: string; createdAt: number; messages: Message[] } }
  | { type: 'OPEN_QUOTE_FORM'; payload: QuoteFormDefaults }
  | { type: 'CLOSE_QUOTE_FORM' }
  | { type: 'SET_QUOTE_FORM_SUBMITTING'; payload: boolean }
  | { type: 'SET_QUOTE_FORM_ERROR'; payload: string | null };

export type Provider = 'nvidia' | 'commandcode';
export type Theme = 'light' | 'dark';
export type WindowMode = 'fullpage' | 'widget';
export type WindowState = 'closed' | 'open' | 'minimized';

export interface ConfigState {
  provider: Provider;
  modelName: string;
  apiKey: string;
  endpoint?: string;
  isSaved: boolean;
  testStatus: 'idle' | 'testing' | 'ok' | 'fail';
}

export interface AppConfig {
  provider: string;
  model: string;
  api_key: string;
  endpoint?: string;
}

export interface CatalogProduct {
  model: string;
  form_factor: string;
  ff_detail: string;
  max_tdp_w: number | null;
  dimm_slots: number | null;
  memory_type: string;
}

export interface CompareResult {
  comparison: Record<string, Record<string, unknown>>;
}

export interface CustomerInfo {
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
}

export interface QuoteLineItem {
  sku: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface IssuerInfo {
  name: string;
  tagline: string;
  address: string;
  email: string;
  phone: string;
  gstin: string;
}

export interface QuoteConfiguration {
  model: string;
  form_factor: string;
  quantity: number;
  use_case: string | null;
}

export interface QuoteReceipt {
  receipt_id: string;
  issue_date: string;
  valid_until: string;
  status: string;
  currency: 'INR';
  issuer: IssuerInfo;
  customer: CustomerInfo;
  configuration: QuoteConfiguration;
  line_items: QuoteLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_label: string;
  tax_amount: number;
  total: number;
  terms: string[];
  notes: string[] | null;
  generated_at: number;
}

export interface QuotePreview {
  per_unit: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  notes: string[];
}

export interface QuotePreviewRequest {
  model: string;
  quantity: number;
  memory_gb: number;
  storage_gb: number;
  gpu_count: number;
}

export interface QuoteLimits {
  model: string;
  form_factor: string | null;
  max_memory_gb: number;
  max_storage_gb: number;
  max_gpu: number;
  gpu_supported: boolean;
  default_dimm_gb: number;
  default_drive_gb: number;
}

export interface QuoteFormSubmitPayload {
  model: string;
  quantity: number;
  memory_gb: number;
  storage_gb: number;
  gpu_count: number;
  use_case: string;
  customer: {
    name: string;
    company: string;
    email: string;
    phone: string;
  };
}
