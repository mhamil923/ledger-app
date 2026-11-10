import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AnalysisModal } from '../../components/AnalysisModal';
import {
  apiClient,
  type BriefOpportunity,
  type MarketBriefRow,
  type MarketEvent,
  type NewsItem,
  type WatchlistItem,
} from '../../lib/api';
import { formatPrice, formatRelativeTime } from '../../lib/format';
import { colors, radius, spacing, type } from '../../theme/colors';

type Tab = 'brief' | 'calendar' | 'news';

const IMPACT_COLOR: Record<MarketEvent['impact'], string> = {
  high: colors.negative,
  medium: colors.warning,
  low: colors.textDim,
};

const HORIZON_LABEL: Record<BriefOpportunity['horizon'], string> = {
  intraday: 'Day trade',
  short_term: 'Swing',
  medium_term: 'Position',
};

export default function MarketsScreen() {
  const [tab, setTab] = useState<Tab>('brief');
  const [analyzing, setAnalyzing] = useState<WatchlistItem | null>(null);

  const calendarQ = useQuery({ queryKey: ['markets', 'calendar'], queryFn: () => apiClient.getMarketCalendar(45), staleTime: 10 * 60_000 });
  const sentimentQ = useQuery({ queryKey: ['markets', 'sentiment'], queryFn: apiClient.getMarketSentiment, staleTime: 30 * 60_000 });
  const watchQ = useQuery({ queryKey: ['watchlist-lite'], queryFn: () => apiClient.getWatchlist(false), staleTime: 5 * 60_000 });

  const nextBig = useMemo(() => {
    const now = Date.now();
    return (calendarQ.data?.events ?? []).find((e) => e.impact === 'high' && Date.parse(e.at) > now) ?? null;
  }, [calendarQ.data]);

  const openAnalysis = (symbol: string, assetType: string): void => {
    const item = watchQ.data?.items.find((w) => w.symbol.toUpperCase() === symbol.toUpperCase() && w.asset_type === assetType)
      ?? watchQ.data?.items.find((w) => w.symbol.toUpperCase() === symbol.toUpperCase());
    if (item) setAnalyzing(item);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader eyebrow="MARKETS" title="Market intel" subtitle="Events, news and today's best measured setups" />

      <View style={styles.strip}>
        <FearGreedPill fg={sentimentQ.data?.fear_greed ?? null} />
        {nextBig ? <NextEventPill e={nextBig} /> : null}
        <Pressable onPress={() => router.push('/crypto-plan')} style={[styles.pill, { justifyContent: 'center' }]}>
          <Text style={styles.pillLabel}>MY COINS</Text>
          <Text style={[styles.pillValue, { color: colors.accent }]}>Break-even & DCA ›</Text>
        </Pressable>
      </View>

      <View style={styles.segment}>
        {(['brief', 'calendar', 'news'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.segBtn, tab === t && styles.segBtnActive]}>
            <Ionicons
              name={t === 'brief' ? 'sparkles-outline' : t === 'calendar' ? 'calendar-outline' : 'newspaper-outline'}
              size={14}
              color={tab === t ? colors.text : colors.textDim}
            />
            <Text style={[styles.segText, tab === t && styles.segTextActive]}>
              {t === 'brief' ? 'AI Brief' : t === 'calendar' ? 'Calendar' : 'News'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'brief' ? <BriefView onOpen={openAnalysis} watch={watchQ.data?.items ?? []} /> : null}
      {tab === 'calendar' ? <CalendarView q={calendarQ} /> : null}
      {tab === 'news' ? <NewsView /> : null}

      <AnalysisModal visible={!!analyzing} item={analyzing} onClose={() => setAnalyzing(null)} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Top strip
// ---------------------------------------------------------------------------

function FearGreedPill({ fg }: { fg: { value: number; label: string } | null }) {
  if (!fg) return null;
  const c = fg.value < 25 ? colors.negative : fg.value < 45 ? colors.warning : fg.value <= 55 ? colors.textMuted : colors.positive;
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>CRYPTO FEAR & GREED</Text>
      <Text style={[styles.pillValue, { color: c }]}>
        {fg.value} · {fg.label}
      </Text>
    </View>
  );
}

function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function countdown(at: string, now: number): string {
  const d = Date.parse(at) - now;
  if (d <= 0) return 'now';
  const h = Math.floor(d / 3_600_000);
  const m = Math.floor((d % 3_600_000) / 60_000);
  if (h >= 48) return `in ${Math.round(h / 24)}d`;
  if (h >= 1) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function NextEventPill({ e }: { e: MarketEvent }) {
  const now = useNow();
  return (
    <View style={[styles.pill, { flex: 1 }]}>
      <Text style={styles.pillLabel}>NEXT HIGH-IMPACT EVENT · {countdown(e.at, now).toUpperCase()}</Text>
      <Text style={styles.pillValue} numberOfLines={1}>
        {e.title}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------

function BriefView({ onOpen, watch }: { onOpen: (s: string, t: string) => void; watch: WatchlistItem[] }) {
  const qc = useQueryClient();
  const briefQ = useQuery({ queryKey: ['markets', 'brief'], queryFn: apiClient.getMarketBrief });
  const gen = useMutation({
    mutationFn: (tier: 'fast' | 'deep') => apiClient.generateMarketBrief(tier),
    onSuccess: (r) => qc.setQueryData(['markets', 'brief'], r),
  });
  const row = briefQ.data?.brief ?? null;
  const ageH = row ? (Date.now() - Date.parse(row.created_at)) / 3_600_000 : null;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.genRow}>
        <Pressable
          disabled={gen.isPending}
          onPress={() => gen.mutate('fast')}
          style={({ pressed }) => [styles.primaryBtn, (pressed || gen.isPending) && { opacity: 0.7 }]}
        >
          {gen.isPending ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="sparkles" size={14} color={colors.bg} />}
          <Text style={styles.primaryBtnText}>{row ? 'Refresh brief' : "Generate today's brief"}</Text>
        </Pressable>
        <Pressable disabled={gen.isPending} onPress={() => gen.mutate('deep')} style={styles.ghostBtn}>
          <Text style={styles.ghostBtnText}>Deep</Text>
        </Pressable>
        {row ? (
          <Text style={[styles.meta, ageH != null && ageH > 12 && { color: colors.warning }]}>
            {formatRelativeTime(Date.parse(row.created_at))} · {row.model.includes('fable') || row.model.includes('opus') ? 'deep' : 'default'}
          </Text>
        ) : null}
      </View>
      {gen.isPending ? (
        <Text style={styles.hint}>Searching the web, reading the calendar and scanning every watchlist chart… usually 30–90 seconds.</Text>
      ) : null}
      {gen.error ? <Text style={styles.error}>{(gen.error as Error).message}</Text> : null}

      {briefQ.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} /> : null}
      {!briefQ.isLoading && !row && !gen.isPending ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No brief yet</Text>
          <Text style={styles.body}>
            The brief reads today&apos;s news on the web, checks the event calendar, and scans every chart on your watchlist for setups
            that have actually worked on that chart before. It only suggests trades where the measured odds and the news line up — and
            it will happily say &quot;nothing today&quot;.
          </Text>
        </View>
      ) : null}
      {row ? <Brief row={row} onOpen={onOpen} watch={watch} /> : null}
    </ScrollView>
  );
}

function Brief({ row, onOpen, watch }: { row: MarketBriefRow; onOpen: (s: string, t: string) => void; watch: WatchlistItem[] }) {
  const d = row.data;
  const regime = d.market_regime === 'risk_on' ? ['RISK-ON', colors.positive] : d.market_regime === 'risk_off' ? ['RISK-OFF', colors.negative] : ['MIXED', colors.warning];
  const onWatch = (s: string): boolean => watch.some((w) => w.symbol.toUpperCase() === s.toUpperCase());
  return (
    <>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={[styles.badge, { borderColor: regime[1] }]}>
            <Text style={[styles.badgeText, { color: regime[1] }]}>{regime[0]}</Text>
          </View>
          <Text style={styles.meta}>
            scanned {d.scanned} charts · {d.measured_candidates} measured setup{d.measured_candidates === 1 ? '' : 's'} firing
          </Text>
        </View>
        <Text style={styles.headline}>{d.headline}</Text>
        <Markdown text={d.summary_markdown} />
      </View>

      <Section title={`Trade ideas${d.opportunities.length ? ` (${d.opportunities.length})` : ''}`} icon="flash-outline">
        {d.opportunities.length === 0 ? (
          <Text style={styles.body}>
            Nothing worth taking right now — no measured setup lines up with the news. Sitting out is a position.
          </Text>
        ) : (
          d.opportunities.map((o) => <OpportunityCard key={o.candidate_id} o={o} onOpen={onWatch(o.symbol) ? () => onOpen(o.symbol, o.asset_type) : undefined} />)
        )}
      </Section>

      {d.event_watch.length ? (
        <Section title="Events that matter this week" icon="calendar-outline">
          {d.event_watch.map((e, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.itemTitle}>
                {e.title} <Text style={styles.meta}>· {e.when}</Text>
              </Text>
              <Text style={styles.body}>{e.why_it_matters}</Text>
              <Text style={[styles.body, { color: colors.accent }]}>Playbook: {e.playbook}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {d.drivers.length ? (
        <Section title="What's moving markets" icon="pulse-outline">
          {d.drivers.map((x, i) => (
            <View key={i} style={styles.listItem}>
              <View style={styles.rowGap}>
                <Ionicons
                  name={x.effect === 'bullish' ? 'arrow-up-circle' : x.effect === 'bearish' ? 'arrow-down-circle' : 'remove-circle'}
                  size={16}
                  color={x.effect === 'bullish' ? colors.positive : x.effect === 'bearish' ? colors.negative : colors.warning}
                />
                <Text style={styles.itemTitle}>{x.title}</Text>
                <Text style={styles.meta}>{x.assets}</Text>
              </View>
              <Text style={styles.body}>{x.detail}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {d.watch.length || d.avoid.length ? (
        <Section title="Your watchlist" icon="eye-outline">
          {d.watch.map((w, i) => (
            <Text key={`w${i}`} style={styles.body}>
              <Text style={[styles.itemTitle, { color: colors.accent }]}>Watch {w.symbol}</Text> — {w.note}
            </Text>
          ))}
          {d.avoid.map((w, i) => (
            <Text key={`a${i}`} style={styles.body}>
              <Text style={[styles.itemTitle, { color: colors.negative }]}>Avoid {w.symbol}</Text> — {w.reason}
            </Text>
          ))}
        </Section>
      ) : null}

      {d.sources.length ? (
        <Section title="Sources read" icon="link-outline">
          {d.sources.map((s) => (
            <Pressable key={s.url} onPress={() => void Linking.openURL(s.url)}>
              <Text style={styles.link} numberOfLines={1}>
                {s.title}
              </Text>
            </Pressable>
          ))}
        </Section>
      ) : null}

      {d.notes.length ? (
        <Text style={styles.footnote}>Server checks: {d.notes.join(' ')}</Text>
      ) : null}
      <Text style={styles.footnote}>
        Odds are measured on each chart&apos;s own history with realistic fills; they describe the past, not a promise. Not financial
        advice — size every trade so a stop-out is affordable.
      </Text>
    </>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <Text style={{ color: colors.warning, fontSize: 12 }}>
      {'★'.repeat(n)}
      <Text style={{ color: colors.border }}>{'★'.repeat(5 - n)}</Text>
    </Text>
  );
}

function OpportunityCard({ o, onOpen }: { o: BriefOpportunity; onOpen?: () => void }) {
  const long = o.direction === 'long';
  const risk = Math.abs((o.entry_zone[0] + o.entry_zone[1]) / 2 - o.stop_loss);
  const reward = Math.abs(o.targets[0]! - (o.entry_zone[0] + o.entry_zone[1]) / 2);
  return (
    <View style={styles.opp}>
      <View style={styles.rowBetween}>
        <View style={styles.rowGap}>
          <Text style={styles.oppSym}>{o.symbol}</Text>
          <View style={[styles.badge, { borderColor: long ? colors.positive : colors.negative }]}>
            <Text style={[styles.badgeText, { color: long ? colors.positive : colors.negative }]}>{long ? 'LONG' : 'SHORT'}</Text>
          </View>
          <Text style={styles.meta}>{HORIZON_LABEL[o.horizon]}</Text>
        </View>
        <Stars n={o.conviction} />
      </View>
      <Text style={styles.meta}>
        {o.setup_label} · {o.entry_kind === 'trigger_now' ? 'enter now' : o.entry_kind === 'pullback' ? 'wait for the pullback' : 'enter on the breakout'} · now{' '}
        {formatPrice(o.price)}
      </Text>
      <View style={styles.levels}>
        <Level label="Entry" value={`${formatPrice(o.entry_zone[0])} – ${formatPrice(o.entry_zone[1])}`} />
        <Level label="Stop" value={formatPrice(o.stop_loss)} color={colors.negative} />
        <Level label="Targets" value={o.targets.slice(0, 2).map((t) => formatPrice(t)).join(' / ')} color={colors.positive} />
      </View>
      <Text style={styles.odds}>
        Hit target 1 in {Math.round(o.backtest.win_rate * 100)}% of {o.backtest.n} past setups on this chart (conservatively{' '}
        {Math.round(o.backtest.win_rate_lower * 100)}%) · avg {o.backtest.avg_r >= 0 ? '+' : ''}
        {o.backtest.avg_r.toFixed(2)}R · reward:risk {risk > 0 ? (reward / risk).toFixed(1) : '–'}
      </Text>
      {o.event_risk ? (
        <View style={styles.warn}>
          <Ionicons name="warning-outline" size={14} color={colors.warning} />
          <Text style={styles.warnText}>{o.event_risk}</Text>
        </View>
      ) : null}
      <Text style={styles.body}>{o.thesis}</Text>
      {o.catalyst ? <Text style={styles.body}><Text style={styles.itemTitle}>Catalyst: </Text>{o.catalyst}</Text> : null}
      {o.risks ? <Text style={styles.body}><Text style={styles.itemTitle}>Risks: </Text>{o.risks}</Text> : null}
      {onOpen ? (
        <Pressable onPress={onOpen} style={styles.openBtn}>
          <Text style={styles.openBtnText}>Open chart & full analysis</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Level({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.levelLabel}>{label}</Text>
      <Text style={[styles.levelValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={[styles.rowGap, { marginBottom: spacing.sm }]}>
        <Ionicons name={icon} size={16} color={colors.textMuted} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** Tiny markdown: paragraphs, "- " bullets and **bold**. */
function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const inline = (s: string, key: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <Text key={`${key}-${i}`} style={{ fontWeight: '700', color: colors.text }}>
          {part.slice(2, -2)}
        </Text>
      ) : (
        part.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2')
      ),
    );
  return (
    <View style={{ gap: spacing.sm }}>
      {blocks.map((b, i) =>
        b === '---' ? null : (
          <Text key={i} style={styles.body}>
            {b.split('\n').map((line, j) => (
              <Text key={j}>
                {j > 0 ? '\n' : ''}
                {line.startsWith('- ') ? '•  ' : ''}
                {inline(line.replace(/^- /, '').replace(/^#+\s*/, ''), `${i}-${j}`)}
              </Text>
            ))}
          </Text>
        ),
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

type CalFilter = 'all' | 'high' | 'macro' | 'earnings' | 'crypto' | 'mine';
const CAL_FILTERS: Array<[CalFilter, string]> = [
  ['all', 'All'],
  ['high', 'High impact'],
  ['macro', 'Fed & data'],
  ['earnings', 'Earnings'],
  ['crypto', 'Crypto'],
  ['mine', 'My symbols'],
];

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000).toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return 'Today';
  if (key === tomorrow) return 'Tomorrow';
  if (key === yesterday) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function CalendarView({ q }: { q: ReturnType<typeof useQuery<{ events: MarketEvent[]; generated_at: string }>> }) {
  const [filter, setFilter] = useState<CalFilter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const now = useNow();
  const events = (q.data?.events ?? []).filter((e) => {
    switch (filter) {
      case 'high': return e.impact === 'high';
      case 'macro': return e.category === 'fed' || e.category === 'macro';
      case 'earnings': return e.category === 'earnings';
      case 'crypto': return e.affects.includes('crypto') && e.category !== 'earnings' && e.category !== 'holiday';
      case 'mine': return e.mine;
      default: return true;
    }
  });
  const groups: Array<[string, MarketEvent[]]> = [];
  for (const e of events) {
    const k = dayKey(e.at);
    const last = groups[groups.length - 1];
    if (last && last[0] === k) last[1].push(e);
    else groups.push([k, [e]]);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.accent} />}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CAL_FILTERS.map(([k, label]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipActive]}>
            <Text style={[styles.chipText, filter === k && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {q.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} /> : null}
      {q.error ? <Text style={styles.error}>{(q.error as Error).message}</Text> : null}
      {!q.isLoading && groups.length === 0 ? <Text style={styles.hint}>Nothing scheduled for this filter.</Text> : null}
      {groups.map(([k, list]) => (
        <View key={k} style={{ marginBottom: spacing.md }}>
          <Text style={styles.dayHeader}>{dayLabel(k)}</Text>
          <View style={styles.card}>
            {list.map((e, i) => {
              const past = Date.parse(e.at) < now;
              const soon = !past && Date.parse(e.at) - now < 48 * 3_600_000;
              const isOpen = open === e.id;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => setOpen(isOpen ? null : e.id)}
                  style={[styles.evRow, i > 0 && styles.evDivider, past && { opacity: 0.45 }]}
                >
                  <Text style={styles.evTime}>
                    {e.all_day ? 'All day' : new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                  <View style={[styles.dot, { backgroundColor: IMPACT_COLOR[e.impact] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.evTitle}>
                      {e.title}
                      {e.mine ? <Text style={{ color: colors.accent }}>  · on your watchlist</Text> : null}
                    </Text>
                    {e.forecast || e.previous ? (
                      <Text style={styles.meta}>
                        {e.forecast ? `Forecast ${e.forecast}` : ''}
                        {e.forecast && e.previous ? ' · ' : ''}
                        {e.previous ? `Previous ${e.previous}` : ''}
                      </Text>
                    ) : null}
                    <View style={styles.rowGap}>
                      {e.affects.map((a) => (
                        <Text key={a} style={styles.tag}>
                          {a}
                        </Text>
                      ))}
                      {soon ? <Text style={[styles.tag, { color: colors.warning, borderColor: colors.warning }]}>{countdown(e.at, now)}</Text> : null}
                    </View>
                    {isOpen && e.detail ? <Text style={[styles.body, { marginTop: 6 }]}>{e.detail}</Text> : null}
                    {isOpen ? <Text style={styles.footnote}>Source: {e.source}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Text style={styles.footnote}>
        Red = high impact, amber = medium. Times are in your local time zone. Tap an event for what it means. Economic releases cover
        the next two weeks; Fed meetings, options expiries and holidays are scheduled further out.
      </Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

type NewsFilter = 'all' | 'mine' | 'crypto' | 'market';

function NewsView() {
  const q = useQuery({ queryKey: ['markets', 'news'], queryFn: apiClient.getMarketNews, staleTime: 5 * 60_000, refetchInterval: 10 * 60_000 });
  const [filter, setFilter] = useState<NewsFilter>('all');
  const items = (q.data?.items ?? []).filter((n: NewsItem) =>
    filter === 'all' ? true : filter === 'mine' ? n.symbols.length > 0 : filter === 'crypto' ? n.category === 'crypto' : n.category !== 'crypto',
  );
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.accent} />}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(
          [
            ['all', 'All'],
            ['mine', 'My symbols'],
            ['crypto', 'Crypto'],
            ['market', 'Stocks & macro'],
          ] as Array<[NewsFilter, string]>
        ).map(([k, label]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipActive]}>
            <Text style={[styles.chipText, filter === k && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {q.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} /> : null}
      {q.error ? <Text style={styles.error}>{(q.error as Error).message}</Text> : null}
      {!q.isLoading && items.length === 0 ? (
        <Text style={styles.hint}>No headlines. (News needs FINNHUB_API_KEY in the backend .env.)</Text>
      ) : null}
      <View style={styles.card}>
        {items.map((n, i) => (
          <Pressable key={n.id + n.url} onPress={() => void Linking.openURL(n.url)} style={[styles.newsRow, i > 0 && styles.evDivider]}>
            <Text style={styles.evTitle}>{n.headline}</Text>
            {n.summary ? (
              <Text style={styles.body} numberOfLines={2}>
                {n.summary}
              </Text>
            ) : null}
            <View style={styles.rowGap}>
              <Text style={styles.meta}>
                {n.source} · {formatRelativeTime(Date.parse(n.at))}
              </Text>
              {n.symbols.map((s) => (
                <Text key={s} style={[styles.tag, { color: colors.accent, borderColor: colors.accentDim }]}>
                  {s}
                </Text>
              ))}
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md, maxWidth: 900, width: '100%', alignSelf: 'center' },
  strip: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm, flexWrap: 'wrap' },
  pill: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 12, minWidth: 150 },
  pillLabel: { ...type.micro, color: colors.textDim, fontSize: 10 },
  pillValue: { ...type.caption, color: colors.text, marginTop: 2 },
  segment: { flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.borderSubtle },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: radius.sm },
  segBtnActive: { backgroundColor: colors.bgCard },
  segText: { ...type.caption, color: colors.textDim },
  segTextActive: { color: colors.text },
  genRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.md },
  primaryBtnText: { ...type.caption, color: colors.bg, fontWeight: '700' },
  ghostBtn: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  ghostBtnText: { ...type.caption, color: colors.warning },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { ...type.heading, color: colors.text },
  headline: { ...type.title, color: colors.text, marginTop: spacing.xs },
  body: { ...type.body, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  meta: { ...type.caption, color: colors.textDim, fontSize: 12 },
  hint: { ...type.caption, color: colors.textMuted },
  error: { ...type.caption, color: colors.negative },
  footnote: { ...type.caption, color: colors.textDim, fontSize: 11, lineHeight: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { ...type.micro, fontSize: 10, fontWeight: '700' },
  listItem: { paddingVertical: 6, gap: 2 },
  itemTitle: { ...type.caption, color: colors.text, fontWeight: '600' },
  link: { ...type.caption, color: colors.accent, paddingVertical: 3 },
  opp: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 6, marginBottom: spacing.sm },
  oppSym: { ...type.heading, color: colors.text },
  levels: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.sm, padding: spacing.sm },
  levelLabel: { ...type.micro, color: colors.textDim, fontSize: 10 },
  levelValue: { ...type.caption, color: colors.text, marginTop: 2 },
  odds: { ...type.caption, color: colors.textMuted, fontSize: 12 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: radius.sm, padding: 6 },
  warnText: { ...type.caption, color: colors.warning, flex: 1, fontSize: 12 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4 },
  openBtnText: { ...type.caption, color: colors.accent },
  chips: { gap: spacing.sm, paddingBottom: spacing.xs },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { ...type.caption, color: colors.textMuted, fontSize: 12 },
  chipTextActive: { color: colors.bg },
  dayHeader: { ...type.micro, color: colors.textMuted, marginBottom: 6, marginLeft: 4, textTransform: 'uppercase' },
  evRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 8, alignItems: 'flex-start' },
  evDivider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  evTime: { ...type.caption, color: colors.textMuted, width: 64, fontSize: 12, paddingTop: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  evTitle: { ...type.body, fontSize: 14, color: colors.text, fontWeight: '500' },
  tag: { ...type.micro, fontSize: 10, color: colors.textDim, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 5, marginTop: 4 },
  newsRow: { paddingVertical: 10, gap: 4 },
});
