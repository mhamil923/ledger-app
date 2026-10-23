import Constants from 'expo-constants';

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ??
  (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase ??
  'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getApiBase(): string {
  return API_BASE;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : null) ?? `Request failed with ${res.status}`;
    throw new ApiError(res.status, payload, message);
  }

  return payload as T;
}

// Typed request helpers + DTOs

export interface User {
  id: string;
  email: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export type AssetType = 'stock' | 'crypto' | 'etf';

export interface Quote {
  symbol: string;
  asset_type: AssetType;
  price: number;
  change_pct: number;
  prev_close: number | null;
  ts: number;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  asset_type: AssetType;
  display_name: string | null;
  external_id: string | null;
  logo_url: string | null;
  sort_order: number;
  created_at: string;
  quote: Quote | null;
  error: string | null;
}

export interface AssetSearchResult {
  symbol: string;
  name: string;
  asset_type: AssetType;
  external_id: string | null;
  source: 'coingecko' | 'finnhub';
  rank: number | null;
  exchange: string | null;
  logo_url: string | null;
}

export interface AssetSearchResponse {
  results: AssetSearchResult[];
  sources: { coingecko: boolean; finnhub: boolean };
}

export interface ChartPoint {
  ts: number;
  price: number;
}

export interface OverlayPoint {
  ts: number;
  value: number;
}

export interface ChartOverlay {
  key: 'sma20' | 'sma50';
  label: string;
  points: OverlayPoint[];
}

export interface VolumePoint {
  ts: number;
  value: number;
}

export interface IndicatorSeries {
  key: 'rsi14';
  label: string;
  points: OverlayPoint[];
}

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ChartRange = '1d' | '7d' | '30d' | '90d' | '1y';
export type ChartType = 'line' | 'area' | 'candle';

export interface ChartResponse {
  symbol: string;
  asset_type: AssetType;
  range: ChartRange;
  chart_type: 'line' | 'candle';
  points: ChartPoint[];
  candles: Candle[];
  overlays: ChartOverlay[];
  volumes: VolumePoint[];
  indicator_series: IndicatorSeries[];
  source: 'coingecko' | 'finnhub' | 'unavailable';
}

export type EntryKind = 'trigger_now' | 'pullback' | 'breakout' | 'waiting';

export interface TradeIdea {
  direction: 'long' | 'short';
  entry_zone: [number, number];
  stop_loss: number;
  targets: number[];
  rationale: string;
  entry_kind?: EntryKind;
  /** Per-horizon conviction 1-5 (only present on multi-horizon responses). */
  conviction?: number;
}

export interface TradeIdeasByHorizon {
  intraday: TradeIdea | null;
  short_term: TradeIdea | null;
  medium_term: TradeIdea | null;
  long_term: TradeIdea | null;
}

export interface IndicatorSnapshot {
  rsi14: number | null;
  rsi14_state: 'oversold' | 'neutral' | 'overbought' | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  macd_state: 'bullish_cross' | 'bearish_cross' | 'bullish' | 'bearish' | null;
  sma20_last: number | null;
  sma50_last: number | null;
  price_vs_sma20_pct: number | null;
  price_vs_sma50_pct: number | null;
}

export interface MarketSentiment {
  fear_greed_index: number;
  fear_greed_label: string;
  source: 'alternative.me';
  ts: number;
}

export type ModelTier = 'fast' | 'deep';

export type AnalysisHorizon = 'intraday' | 'short_term' | 'medium_term' | 'long_term';

export interface AlternativeScenario {
  if: string;
  then: string;
}

export interface MultiTimeframe {
  short_term: string;
  medium_term: string;
  long_term: string;
}

export interface AnalysisData {
  headline: string;
  summary_markdown: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  conviction: number;
  /** Which horizon to default the chips to. Same valid values as time_horizon. */
  primary_horizon: 'intraday' | 'short_term' | 'medium_term' | 'long_term';
  time_horizon: 'intraday' | 'short_term' | 'medium_term' | 'long_term';
  /** All 4 horizons returned in a single call. Slots may be null on legacy
   *  cached rows. */
  trade_ideas: TradeIdeasByHorizon;
  key_levels: { support: number[]; resistance: number[] };
  risks: string[];
  // Deep-dive-only fields. Present when model_tier='deep'.
  confluence_factors?: string[];
  multi_timeframe?: MultiTimeframe;
  alternative_scenarios?: AlternativeScenario[];
  catalysts?: string[];
  position_sizing?: string;
  indicators?: IndicatorSnapshot;
  sentiment?: MarketSentiment | null;
}

export interface AnalysisResponse {
  cached: boolean;
  id: string;
  content: string;
  model: string;
  analysis_date: string;
  created_at: string;
  data: AnalysisData | null;
}

export type TradeStatus = 'pending' | 'active' | 'closed' | 'expired';
export type TradeDirection = 'long' | 'short';

export interface TradeIdeaRecord {
  id: string;
  symbol: string;
  asset_type: AssetType;
  external_id: string | null;
  display_name: string | null;
  direction: TradeDirection;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  targets: number[];
  bias: string;
  conviction: number;
  time_horizon: string;
  rationale: string | null;
  price_at_creation: number;
  rsi14_at_creation: number | null;
  macd_state_at_creation: string | null;
  fear_greed_at_creation: number | null;
  model: string;
  status: TradeStatus;
  triggered_at: string | null;
  triggered_price: number | null;
  resolved_at: string | null;
  resolved_price: number | null;
  resolution: string | null;
  realized_pnl_pct: number | null;
  created_at: string;
  updated_at: string;
}

export interface TradeSummary {
  total: number;
  closed: number;
  winners: number;
  losers: number;
  pending: number;
  active: number;
  expired: number;
  win_rate_pct: number;
  recent: TradeIdeaRecord[];
}

export interface HoldingSummary {
  id: string;
  symbol: string;
  asset_type: AssetType;
  notes: string | null;
  total_quantity: number;
  total_cost: number;
  avg_cost: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_pl: number | null;
  unrealized_pl_pct: number | null;
  quote_error: string | null;
  lot_count: number;
}

export interface PortfolioTotals {
  total_value: number;
  total_cost: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  priced_value: number;
  unpriced_holdings: number;
}

export interface HoldingLot {
  id: string;
  holding_id: string;
  quantity: string;
  cost_per_unit: string;
  acquired_at: string;
  notes: string | null;
  created_at: string;
}

export interface HoldingDetail {
  holding: HoldingSummary;
  lots: HoldingLot[];
}

export interface LotInput {
  quantity: number;
  cost_per_unit: number;
  acquired_at: string;
  notes?: string;
}

export type WalletChain =
  | 'ethereum'
  | 'polygon'
  | 'arbitrum'
  | 'base'
  | 'bitcoin'
  | 'solana';

export interface WalletChainMeta {
  id: WalletChain;
  label: string;
  native_symbol: string;
}

export interface WalletBalance {
  symbol: string;
  quantity: number;
  usd_value: number | null;
  price: number | null;
  quote_error: string | null;
}

export interface Wallet {
  id: string;
  label: string;
  chain: WalletChain;
  chain_label: string;
  address: string;
  last_synced_at: string | null;
  created_at: string;
  balances: WalletBalance[];
  total_usd_value: number;
}

export type BankAccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'loan'
  | 'investment'
  | 'depository';

export interface BankConnection {
  status: 'active' | 'error' | 'revoked' | string;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface BankAccount {
  id: string;
  provider_account_id: string;
  institution: string | null;
  name: string;
  account_type: BankAccountType | string;
  mask: string | null;
  currency: string;
  current_balance: number | null;
  last_synced_at: string | null;
  /** Off-budget accounts (brokerage, loans) are tracked for net worth only. */
  on_budget?: boolean;
  /** When the bank's numbers are actually from (SimpleFIN refreshes ~daily). */
  balance_as_of?: string | null;
  /** 'simplefin' or 'apple_card' (CSV import). */
  provider?: string;
}

export interface BankTransaction {
  id: string;
  account_id: string;
  posted_at: string;
  amount: number;
  currency: string;
  description: string;
  merchant: string | null;
  category: string | null;
  pending: boolean;
  /** True for credit-card payments and transfers between your own accounts.
   *  Stored by the server's transaction engine (paired, pattern, rule or
   *  manual) — these never count as spending or income. */
  is_transfer?: boolean;
  transfer_source?: 'paired' | 'pattern' | 'rule' | 'manual' | null;
  transfer_txn_id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category_source?: 'rule' | 'ai' | 'manual' | null;
  notes?: string | null;
  account_name?: string;
  institution?: string | null;
  account_type?: string;
  on_budget?: boolean;
}

export interface ReadinessResponse {
  ready: boolean;
  checks: {
    database: boolean;
    anthropic: boolean;
    finnhub: boolean;
    twelvedata: boolean;
    alpaca_paper: boolean;
    alpaca_live: boolean;
    coinbase_trade: boolean;
  };
}

export type ExchangeAccount =
  | {
      provider: 'alpaca';
      env: 'paper' | 'live';
      label: string;
      configured: boolean;
      equity?: number;
      buying_power?: number;
      cash?: number;
      currency?: string;
      account_blocked?: boolean;
    }
  | {
      provider: 'coinbase';
      label: string;
      configured: boolean;
      usd_balance?: number;
      balances?: Array<{ currency: string; amount: number; usd_value: number | null }>;
      total_usd_value?: number;
    };

export interface AlpacaOrderInput {
  provider: 'alpaca';
  env: 'paper' | 'live';
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  limit_price: number;
  stop_loss: number;
  take_profit: number;
  time_in_force?: 'day' | 'gtc';
}

export interface CoinbaseOrderInput {
  provider: 'coinbase';
  product_id: string;
  side: 'BUY' | 'SELL';
  base_size?: number;
  quote_size?: number;
  limit_price?: number;
  stop_price?: number;
}

export type ExecuteOrderInput = AlpacaOrderInput | CoinbaseOrderInput;

export const apiClient = {
  readiness: () => api<ReadinessResponse>('/health/ready'),
  login: (email: string, password: string) =>
    api<LoginResponse>('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => api<{ user: User }>('/api/auth/me'),
  getWatchlist: (withQuotes = true) =>
    api<{ items: WatchlistItem[] }>(`/api/watchlist?quotes=${withQuotes}`),
  addWatchlist: (input: {
    symbol: string;
    asset_type: AssetType;
    display_name?: string;
    external_id?: string;
    logo_url?: string;
  }) => api<{ item: WatchlistItem }>('/api/watchlist', { method: 'POST', body: input }),
  getChart: (params: {
    symbol: string;
    asset_type: AssetType;
    external_id?: string | null;
    range?: ChartRange;
    chart_type?: 'line' | 'candle';
  }) => {
    const q = new URLSearchParams({
      symbol: params.symbol,
      asset_type: params.asset_type,
      range: params.range ?? '7d',
      chart_type: params.chart_type ?? 'line',
    });
    if (params.external_id) q.set('external_id', params.external_id);
    return api<ChartResponse>(`/api/chart?${q.toString()}`);
  },
  searchAssets: (query: string, types?: AssetType[]) => {
    const params = new URLSearchParams({ q: query });
    if (types && types.length) params.set('types', types.join(','));
    return api<AssetSearchResponse>(`/api/search?${params.toString()}`);
  },
  removeWatchlist: (id: string) => api<{ ok: true }>(`/api/watchlist/${id}`, { method: 'DELETE' }),
  reorderWatchlist: (order: string[]) =>
    api<{ ok: true }>('/api/watchlist/reorder', { method: 'POST', body: { order } }),
  analyze: (
    symbol: string,
    asset_type: AssetType,
    options: {
      force_refresh?: boolean;
      external_id?: string | null;
      model_tier?: ModelTier;
      analysis_horizon?: AnalysisHorizon;
    } = {},
  ) =>
    api<AnalysisResponse>('/api/analysis', {
      method: 'POST',
      body: {
        symbol,
        asset_type,
        external_id: options.external_id ?? undefined,
        force_refresh: options.force_refresh ?? false,
        model_tier: options.model_tier ?? 'fast',
        analysis_horizon: options.analysis_horizon ?? 'short_term',
      },
    }),

  getPortfolio: () =>
    api<{ holdings: HoldingSummary[]; totals: PortfolioTotals }>('/api/portfolio'),
  getHolding: (id: string) => api<HoldingDetail>(`/api/portfolio/${id}`),
  addHolding: (input: {
    symbol: string;
    asset_type: AssetType;
    notes?: string;
    external_id?: string;
    initial_lot?: LotInput;
  }) => api<HoldingDetail>('/api/portfolio', { method: 'POST', body: input }),
  addLot: (holdingId: string, lot: LotInput) =>
    api<HoldingDetail>(`/api/portfolio/${holdingId}/lots`, { method: 'POST', body: lot }),
  deleteLot: (lotId: string) => api<{ ok: true }>(`/api/portfolio/lots/${lotId}`, { method: 'DELETE' }),
  updateHoldingNotes: (id: string, notes: string | null) =>
    api<{ ok: true }>(`/api/portfolio/${id}`, { method: 'PATCH', body: { notes } }),
  deleteHolding: (id: string) => api<{ ok: true }>(`/api/portfolio/${id}`, { method: 'DELETE' }),

  getWallets: () =>
    api<{ wallets: Wallet[]; total_usd_value: number }>('/api/wallets'),
  getWalletChains: () => api<{ chains: WalletChainMeta[] }>('/api/wallets/chains'),
  addWallet: (input: { label: string; chain: WalletChain; address: string }) =>
    api<Wallet>('/api/wallets', { method: 'POST', body: input }),
  syncWallet: (id: string) => api<Wallet>(`/api/wallets/${id}/sync`, { method: 'POST' }),
  deleteWallet: (id: string) => api<{ ok: true }>(`/api/wallets/${id}`, { method: 'DELETE' }),

  getBankAccounts: () =>
    api<{ connection: BankConnection | null; accounts: BankAccount[] }>('/api/banking/accounts'),
  connectBank: (setup_token: string) =>
    api<{ ok: true; connection_id: string; accounts: number; transactions: number }>(
      '/api/banking/connect',
      { method: 'POST', body: { setup_token } },
    ),
  syncBank: () =>
    api<{ ok: true; accounts: number; transactions: number; errors: string[] }>(
      '/api/banking/sync',
      { method: 'POST' },
    ),
  disconnectBank: () => api<{ ok: true; deleted: number }>('/api/banking/connection', { method: 'DELETE' }),
  detectRecurringBills: (days?: number) => {
    const suffix = days ? `?days=${days}` : '';
    return api<{ candidates: RecurringCandidate[] }>(`/api/banking/recurring${suffix}`);
  },
  detectAnnualFees: () =>
    api<{ fees: DetectedAnnualFee[] }>('/api/banking/annual-fees'),
  getBankTransactions: (params: { limit?: number; account_id?: string; days?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.account_id) q.set('account_id', params.account_id);
    if (params.days) q.set('days', String(params.days));
    const suffix = q.toString();
    return api<{ transactions: BankTransaction[] }>(
      `/api/banking/transactions${suffix ? `?${suffix}` : ''}`,
    );
  },
  getSpending: () => api<unknown>('/api/spending'),

  getTrades: (params: { symbol?: string; status?: TradeStatus; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.symbol) q.set('symbol', params.symbol);
    if (params.status) q.set('status', params.status);
    if (params.limit) q.set('limit', String(params.limit));
    return api<{ trades: TradeIdeaRecord[] }>(`/api/trades?${q.toString()}`);
  },
  getTradesSummary: () => api<TradeSummary>('/api/trades/summary'),

  getExchangeAccounts: () => api<{ accounts: ExchangeAccount[] }>('/api/execute/accounts'),
  placeOrder: (input: ExecuteOrderInput) =>
    api<{ provider: string; order: unknown }>('/api/execute/order', {
      method: 'POST',
      body: input,
    }),

  getBills: () => api<{ bills: Bill[]; monthly_total: number }>('/api/bills'),
  addBill: (input: BillInput) => api<{ bill: Bill }>('/api/bills', { method: 'POST', body: input }),
  updateBill: (id: string, input: Partial<BillInput> & { active?: boolean }) =>
    api<{ ok: true }>(`/api/bills/${id}`, { method: 'PATCH', body: input }),
  markBillPaid: (id: string, paid_at: string, amount?: number) =>
    api<{ ok: true }>(`/api/bills/${id}/payments`, {
      method: 'POST',
      body: { paid_at, amount, advance_due_date: true },
    }),
  deleteBill: (id: string) => api<{ ok: true }>(`/api/bills/${id}`, { method: 'DELETE' }),

  // ---- Envelope budget (Actual Budget model) ----
  getBudget: (month?: string) => {
    const qs = month ? `?month=${encodeURIComponent(month)}` : '';
    return api<EnvelopeBudget>(`/api/budgets${qs}`);
  },
  setBudgeted: (month: string, categoryId: string, budgeted: number) =>
    api<EnvelopeBudget>(`/api/budgets/${month}/categories/${categoryId}`, {
      method: 'PUT',
      body: { budgeted },
    }),
  moveMoney: (
    month: string,
    input: { from_category_id: string | null; to_category_id: string | null; amount: number },
  ) => api<EnvelopeBudget>(`/api/budgets/${month}/move`, { method: 'POST', body: input }),
  copyLastMonth: (month: string, overwrite = false) =>
    api<EnvelopeBudget & { copied: number }>(`/api/budgets/${month}/copy-last-month`, {
      method: 'POST',
      body: { overwrite },
    }),
  fundBills: (month: string) =>
    api<EnvelopeBudget & { funded: number }>(`/api/budgets/${month}/fund-bills`, { method: 'POST' }),
  getBudgetSettings: () => api<{ settings: BudgetSettings }>('/api/budgets/settings'),
  updateBudgetSettings: (input: { start_month?: string; starting_funds?: number }) =>
    api<{ settings: BudgetSettings }>('/api/budgets/settings', { method: 'PATCH', body: input }),

  getCategories: () => api<{ categories: Category[]; groups: string[] }>('/api/categories'),
  addCategory: (input: {
    name: string;
    group_name?: string;
    is_income?: boolean;
    rollover_overspending?: boolean;
    match_patterns?: string[];
    budgeted?: number;
    month?: string;
  }) => api<{ category: Category }>('/api/categories', { method: 'POST', body: input }),
  updateCategory: (
    id: string,
    input: {
      name?: string;
      group_name?: string;
      rollover_overspending?: boolean;
      hidden?: boolean;
      match_patterns?: string[];
    },
  ) => api<{ category: Category }>(`/api/categories/${id}`, { method: 'PATCH', body: input }),
  deleteCategory: (id: string, transferTo?: string) =>
    api<{ ok: true }>(
      `/api/categories/${id}${transferTo ? `?transfer_to=${encodeURIComponent(transferTo)}` : ''}`,
      { method: 'DELETE' },
    ),

  getRules: () => api<{ rules: CategoryRule[] }>('/api/rules'),
  addRule: (input: CategoryRuleInput) =>
    api<{ rule: CategoryRule; processed: ProcessResult }>('/api/rules', { method: 'POST', body: input }),
  updateRule: (id: string, input: CategoryRuleInput) =>
    api<{ rule: CategoryRule; processed: ProcessResult }>(`/api/rules/${id}`, { method: 'PATCH', body: input }),
  deleteRule: (id: string) => api<{ ok: true }>(`/api/rules/${id}`, { method: 'DELETE' }),
  runRules: () => api<{ processed: ProcessResult }>('/api/rules/run', { method: 'POST' }),

  getTransactions: (params: {
    month?: string;
    days?: number;
    category_id?: string;
    account_id?: string;
    uncategorized?: boolean;
    transfers?: 'include' | 'exclude' | 'only';
    search?: string;
    limit?: number;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.month) q.set('month', params.month);
    if (params.days) q.set('days', String(params.days));
    if (params.category_id) q.set('category_id', params.category_id);
    if (params.account_id) q.set('account_id', params.account_id);
    if (params.uncategorized) q.set('uncategorized', '1');
    if (params.transfers) q.set('transfers', params.transfers);
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', String(params.limit));
    const suffix = q.toString();
    return api<{ transactions: BankTransaction[] }>(`/api/transactions${suffix ? `?${suffix}` : ''}`);
  },
  updateTransaction: (
    id: string,
    input: { category_id?: string | null; is_transfer?: boolean; notes?: string | null; make_rule?: boolean },
  ) =>
    api<{ transaction: BankTransaction; rule: { id: string; value: string } | null; processed: ProcessResult | null }>(
      `/api/transactions/${id}`,
      { method: 'PATCH', body: input },
    ),
  importAppleCard: (csv: string, balance_owed?: number) =>
    api<{
      ok: true;
      rows: number;
      inserted: number;
      updated: number;
      skipped: number;
      from?: string;
      to?: string;
      processed: ProcessResult;
    }>('/api/banking/import/apple-card', { method: 'POST', body: { csv, balance_owed } }),
  setAccountOnBudget: (id: string, on_budget: boolean) =>
    api<{ ok: true }>(`/api/banking/accounts/${id}`, { method: 'PATCH', body: { on_budget } }),

  getOverview: () => api<Overview>('/api/overview'),
};

export type BillCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';

export interface BillInput {
  name: string;
  merchant?: string;
  amount: number;
  currency?: string;
  cadence: BillCadence;
  next_due_date?: string;
  auto_detected?: boolean;
}

export interface RecurringCandidate {
  merchant: string;
  median_amount: number;
  cadence: BillCadence;
  cadence_label: string;
  occurrences: number;
  last_seen: string;
  next_estimated: string;
  account_id: string;
  confidence: number;
  amount_variance_pct: number;
  recent_amounts: number[];
}

export interface DetectedAnnualFee {
  account_id: string;
  last_charged: string;
  next_estimated: string;
  amount: number;
  description: string;
}

export interface Bill {
  id: string;
  name: string;
  merchant: string | null;
  amount: number;
  currency: string;
  cadence: BillCadence;
  next_due_date: string | null;
  account_id: string | null;
  auto_detected: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
  monthly_equivalent: number;
  last_paid_at: string | null;
  total_paid: number;
  last_charge_amount?: number | null;
  last_charge_date?: string | null;
  /** Latest charge differs from the saved amount (e.g. utilities added to rent). */
  amount_changed?: boolean;
}

export interface BudgetSettings {
  start_month: string;
  starting_funds: number;
  processed_at: string | null;
}

export interface Category {
  id: string;
  name: string;
  group_name: string;
  is_income: boolean;
  rollover_overspending: boolean;
  hidden: boolean;
  sort_order: number;
  match_patterns: string[];
}

export interface EnvelopeCategory extends Category {
  /** Assigned to this category this month. */
  budgeted: number;
  /** Signed sum of this month's transactions (negative = spent). */
  activity: number;
  /** Positive leftover carried in from last month (or negative, when
   *  rollover_overspending is on). */
  carryover: number;
  /** What's left to spend: carryover + budgeted + activity. */
  balance: number;
  bill: {
    id: string;
    cadence: BillCadence;
    amount: number;
    next_due_date: string | null;
    monthly_equivalent: number;
  } | null;
}

export interface EnvelopeGroup {
  name: string;
  budgeted: number;
  activity: number;
  balance: number;
  categories: EnvelopeCategory[];
}

export interface EnvelopeBudget {
  month: string;
  current_month?: string;
  start_month: string;
  starting_funds: number;
  before_start: boolean;
  autofilled?: boolean;
  /** Money not yet assigned to any category. Negative = over-assigned. */
  to_budget: number;
  summary: {
    carried_in: number;
    income: number;
    budgeted: number;
    spent: number;
    overspent_last_month: number;
    uncategorized_spent: number;
    uncategorized_count: number;
    transfers_excluded: number;
    available_in_categories: number;
  };
  groups: EnvelopeGroup[];
  income_categories: Array<{ id: string; name: string; activity: number }>;
}

export interface CategoryRuleInput {
  stage?: 'pre' | 'default' | 'post';
  field?: 'any' | 'payee' | 'description';
  op?: 'contains' | 'is' | 'starts_with' | 'pattern';
  value: string;
  amount_min?: number | null;
  amount_max?: number | null;
  account_id?: string | null;
  category_id?: string | null;
  set_transfer?: boolean | null;
}

export interface CategoryRule extends Required<Omit<CategoryRuleInput, 'amount_min' | 'amount_max'>> {
  id: string;
  amount_min: string | null;
  amount_max: string | null;
  source: 'manual' | 'learned' | 'category_pattern' | 'bill';
  category_name: string | null;
  hits: number;
  created_at: string;
}

export interface ProcessResult {
  scanned: number;
  transfers_paired: number;
  transfers_by_pattern: number;
  categorized_by_rule: number;
  categorized_by_ai: number;
  uncategorized_spending: number;
  changed: number;
}

export interface Overview {
  month: string;
  budget: {
    cash: number;
    credit_card_debt: number;
    to_budget: number;
    available_in_categories: number;
    income_this_month: number;
    spent_this_month: number;
    uncategorized_count: number;
    moved_to_trading_this_month: number;
    investing_envelope_available: number | null;
    investing_envelope_budgeted: number | null;
  };
  trading: {
    capital_in_trades: number;
    holdings_value: number;
    holdings_unrealized_pl: number;
    alpaca_live_equity: number;
    alpaca_paper_equity: number;
    coinbase_value: number;
    wallets_value: number;
    linked_investment_accounts: number;
    errors: string[];
  };
  net_worth: number;
  off_budget_accounts: Array<{ name: string; institution: string | null; type: string; balance: number }>;
}
