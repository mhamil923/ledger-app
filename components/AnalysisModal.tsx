import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  ApiError,
  type AnalysisHorizon,
  type AnalysisResponse,
  type Candle,
  type ChartOverlay,
  type ChartPoint,
  type ChartRange,
  type ChartType,
  type IndicatorSeries,
  type ModelTier,
  type TradeIdeasByHorizon,
  type VolumePoint,
  type WatchlistItem,
} from '../lib/api';
import { QuantPanel } from './MeasuredOdds';
import { useMinWinRate } from '../lib/prefs';
import { PriceChart, type HorizontalLevel } from './PriceChart';
import { TradeIdeaCard } from './TradeIdeaCard';
import { DeepDiveExtras } from './DeepDiveExtras';
import { MarketContextStrip } from './MarketContextStrip';
import { RecentTradesPanel } from './RecentTradesPanel';
import { Scorecard } from './Scorecard';
import { ExecuteOrderModal } from './ExecuteOrderModal';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  item: WatchlistItem | null;
  onClose: () => void;
}

export function AnalysisModal({ visible, item, onClose }: Props) {
  // Cache analyses per (model_tier, horizon) so flipping between chips in the
  // same session is instant and doesn't burn Claude tokens. Cleared when the
  // modal opens for a different item.
  const [analysisCache, setAnalysisCache] = useState<Record<string, AnalysisResponse>>({});
  const [executeOpen, setExecuteOpen] = useState(false);
  const [minWinRate, setMinWinRate] = useMinWinRate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [chartCandles, setChartCandles] = useState<Candle[]>([]);
  const [chartOverlays, setChartOverlays] = useState<ChartOverlay[]>([]);
  const [chartVolumes, setChartVolumes] = useState<VolumePoint[]>([]);
  const [chartIndicatorSeries, setChartIndicatorSeries] = useState<IndicatorSeries[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>('30d');
  const [chartType, setChartType] = useState<ChartType>('area');
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartUnavailable, setChartUnavailable] = useState(false);
  const [modelTier, setModelTier] = useState<ModelTier>('fast');
  const [horizon, setHorizon] = useState<AnalysisHorizon>('short_term');

  // Cache key is the model tier alone — one response covers all 4 horizons.
  const data: AnalysisResponse | null = analysisCache[modelTier] ?? null;

  // Per-item request id so async responses from a previous item are ignored.
  const requestIdRef = useRef(0);
  // Per-chart-fetch id so out-of-order range/type switches don't show stale data.
  const chartReqIdRef = useRef(0);

  const loadAnalysis = useCallback(
    async (force: boolean, tierOverride?: ModelTier) => {
      if (!item) return;
      const usedTier = tierOverride ?? modelTier;
      const myId = requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        // Multi-horizon: one response covers all four trade ideas. We no
        // longer send analysis_horizon — the backend ignores it now. Cache
        // by tier only (one response per tier, used across all 4 chips).
        const result = await apiClient.analyze(item.symbol, item.asset_type, {
          force_refresh: force,
          external_id: item.external_id,
          model_tier: usedTier,
        });
        if (myId !== requestIdRef.current) return;
        setAnalysisCache((prev) => ({ ...prev, [usedTier]: result }));
      } catch (err) {
        if (myId !== requestIdRef.current) return;
        const message =
          err instanceof ApiError && err.status === 503
            ? 'AI analysis requires an Anthropic API key. Add ANTHROPIC_API_KEY to your backend .env and restart.'
            : err instanceof Error
              ? err.message
              : 'Failed to generate analysis';
        setError(message);
      } finally {
        if (myId === requestIdRef.current) setLoading(false);
      }
    },
    [item, modelTier],
  );

  const loadChart = useCallback(
    async (range: ChartRange, type: ChartType, attempt = 0, fetchId?: number): Promise<void> => {
      if (!item) return;
      const itemId = requestIdRef.current;
      // On the initial call, increment and capture the new chart-fetch id.
      // Retries reuse the original id so they're still considered "current".
      const myFetchId = fetchId ?? ++chartReqIdRef.current;
      const MAX_ATTEMPTS = 4;
      const apiType = type === 'candle' ? 'candle' : 'line';
      if (attempt === 0) {
        setChartLoading(true);
        setChartError(null);
      }
      try {
        const result = await apiClient.getChart({
          symbol: item.symbol,
          asset_type: item.asset_type,
          external_id: item.external_id,
          range,
          chart_type: apiType,
        });
        // Reject if either the modal switched items, or a newer chart request superseded this one.
        if (itemId !== requestIdRef.current || myFetchId !== chartReqIdRef.current) return;
        if (result.source === 'unavailable') {
          setChartUnavailable(true);
          setChartPoints([]);
          setChartCandles([]);
          setChartOverlays([]);
          setChartVolumes([]);
          setChartIndicatorSeries([]);
        } else {
          setChartUnavailable(false);
          setChartPoints(result.points);
          setChartCandles(result.candles ?? []);
          setChartOverlays(result.overlays ?? []);
          setChartVolumes(result.volumes ?? []);
          setChartIndicatorSeries(result.indicator_series ?? []);
        }
        setChartLoading(false);
      } catch (err) {
        if (itemId !== requestIdRef.current || myFetchId !== chartReqIdRef.current) return;
        if (attempt < MAX_ATTEMPTS - 1) {
          const delay = 1500 * Math.pow(2, attempt);
          setTimeout(() => {
            if (itemId === requestIdRef.current && myFetchId === chartReqIdRef.current) {
              void loadChart(range, type, attempt + 1, myFetchId);
            }
          }, delay);
          return;
        }
        setChartError(err instanceof Error ? err.message : 'Chart failed');
        setChartPoints([]);
        setChartCandles([]);
        setChartLoading(false);
      }
    },
    [item],
  );

  useEffect(() => {
    if (visible && item) {
      requestIdRef.current++;
      setAnalysisCache({});
      setError(null);
      setLoading(false);
      setChartPoints([]);
      setChartOverlays([]);
      setChartVolumes([]);
      setChartIndicatorSeries([]);
      setChartUnavailable(false);
      setChartError(null);
      setChartRange('30d');
      setChartType('area');
      setChartCandles([]);
      void loadAnalysis(false);
      void loadChart('30d', 'area');
    }
  }, [visible, item, loadAnalysis, loadChart]);

  const handleRangeChange = (range: ChartRange): void => {
    setChartRange(range);
    void loadChart(range, chartType);
  };

  // Auto-refresh the chart while the modal is open so it feels "live".
  // 1d range refreshes every 15s (we're tracking minute-by-minute price action);
  // longer ranges refresh every 60s (slower-moving data, less point in spamming).
  // Pauses when the tab/window isn't visible — no point burning API calls on a hidden tab.
  useEffect(() => {
    if (!visible || !item) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const intervalMs = chartRange === '1d' ? 15_000 : 60_000;
    const tick = (): void => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadChart(chartRange, chartType);
    };
    const handle = setInterval(tick, intervalMs);
    return () => clearInterval(handle);
  }, [visible, item, chartRange, chartType, loadChart]);

  const handleChartTypeChange = (next: ChartType): void => {
    setChartType(next);
    // Refetch only if we need a different API payload (line ↔ candle).
    const wasCandle = chartType === 'candle';
    const isCandle = next === 'candle';
    if (wasCandle !== isCandle) {
      void loadChart(chartRange, next);
    }
  };

  // Latest price from the live-polling chart. Used both for trade status badge
  // and to decide whether to silently re-analyze.
  const livePrice =
    chartPoints.length > 0 ? chartPoints[chartPoints.length - 1]!.price : null;

  // Auto re-analyze when (a) the modal has been showing this analysis for >5 min
  // AND (b) the live price has drifted >1% from the price at analysis time.
  // We snapshot the price when fresh analysis lands, then watch for drift.
  // autoRefreshFiredRef gates this to one trigger per analysis row so we don't
  // ping the backend on every chart tick while waiting for the new result.
  const autoRefreshFiredRef = useRef(false);
  const snapshotPriceRef = useRef<number | null>(null);
  const analysisCreatedAt = data?.created_at ?? null;

  useEffect(() => {
    autoRefreshFiredRef.current = false;
    snapshotPriceRef.current = livePrice;
    // We only want to capture the snapshot when fresh data arrives, not on
    // every livePrice tick. analysisCreatedAt is the natural identifier for
    // "this is a new analysis row".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisCreatedAt]);

  useEffect(() => {
    if (!visible || !item || !data || loading) return;
    if (autoRefreshFiredRef.current) return;
    const snap = snapshotPriceRef.current;
    if (livePrice == null || snap == null || !analysisCreatedAt) return;
    const ageMs = Date.now() - new Date(analysisCreatedAt).getTime();
    if (ageMs < 5 * 60_000) return;
    const drift = Math.abs(livePrice - snap) / snap;
    if (drift < 0.01) return;
    autoRefreshFiredRef.current = true;
    void loadAnalysis(true);
  }, [visible, item, data, loading, livePrice, analysisCreatedAt, loadAnalysis]);

  // Build horizontal trade-level lines from the structured analysis data.
  // Be defensive — model output occasionally omits required fields despite
  // the tool schema marking them required.
  const levels: HorizontalLevel[] = [];
  // Pull the trade idea for whichever horizon the chips have selected. Defaults
  // to the model's primary_horizon when the user hasn't switched off it yet.
  const displayHorizon = horizon ?? data?.data?.primary_horizon ?? null;
  const tradeIdea = displayHorizon
    ? data?.data?.trade_ideas?.[displayHorizon] ?? null
    : null;
  const entryLow = tradeIdea?.entry_zone?.[0];
  const entryHigh = tradeIdea?.entry_zone?.[1];
  if (tradeIdea && typeof entryLow === 'number' && typeof entryHigh === 'number') {
    levels.push({ price: entryLow, label: 'ENTRY', color: colors.accent });
    levels.push({ price: entryHigh, color: colors.accent });
    if (typeof tradeIdea.stop_loss === 'number') {
      levels.push({
        price: tradeIdea.stop_loss,
        label: 'STOP',
        color: colors.negative,
      });
    }
    if (Array.isArray(tradeIdea.targets)) {
      tradeIdea.targets.forEach((t: number, i: number) => {
        if (typeof t === 'number') {
          levels.push({ price: t, label: `TP${i + 1}`, color: colors.positive });
        }
      });
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.eyebrow}>AI ANALYSIS</Text>
              <Text style={styles.title}>{item?.symbol ?? ''}</Text>
              {item?.display_name ? <Text style={styles.subtitle}>{item.display_name}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <HorizonPicker
              value={horizon}
              onChange={(next) => {
                // No API call — one analysis covers all 4 horizons, so the
                // chips are pure view-switchers. Instant; zero token cost.
                setHorizon(next);
              }}
              tradeIdeas={data?.data?.trade_ideas ?? null}
              primaryHorizon={data?.data?.primary_horizon ?? null}
            />
            {data?.data ? (
              <MarketContextStrip
                indicators={data.data.indicators}
                sentiment={data.data.sentiment}
              />
            ) : null}
            {chartUnavailable ? (
              <View style={styles.chartUnavailable}>
                <Ionicons name="bar-chart-outline" size={18} color={colors.textDim} />
                <Text style={styles.chartUnavailableText}>
                  Stock/ETF charts need a Twelve Data key. Add{' '}
                  <Text style={styles.chartUnavailableCode}>TWELVE_DATA_API_KEY</Text> to your
                  backend <Text style={styles.chartUnavailableCode}>.env</Text> and restart. (Free
                  tier: 800 calls/day at twelvedata.com.)
                </Text>
              </View>
            ) : chartError ? (
              <View style={styles.chartUnavailable}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                <Text style={styles.chartUnavailableText}>{chartError}</Text>
              </View>
            ) : (
              <PriceChart
                points={chartPoints}
                candles={chartCandles}
                overlays={chartOverlays}
                volumes={chartVolumes}
                indicatorSeries={chartIndicatorSeries}
                levels={levels}
                range={chartRange}
                onRangeChange={handleRangeChange}
                chartType={chartType}
                onChartTypeChange={handleChartTypeChange}
                loading={chartLoading}
                symbol={item?.symbol}
                assetType={item?.asset_type}
                live={!chartLoading && !chartError}
              />
            )}

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={styles.loadingText}>
                  Analyzing {item?.symbol} with Claude…
                </Text>
              </View>
            ) : error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={28} color={colors.negative} />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => void loadAnalysis(false)} style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>Try again</Text>
                </Pressable>
              </View>
            ) : data ? (
              <>
                {data.cached ? (
                  <View style={styles.cachedBadge}>
                    <Ionicons name="time-outline" size={12} color={colors.textDim} />
                    <Text style={styles.cachedText}>{cachedAgeLabel(data.created_at)}</Text>
                  </View>
                ) : null}

                {data.data && item ? (
                  <TradeIdeaCard
                    data={data.data}
                    assetType={item.asset_type}
                    selectedHorizon={horizon}
                    livePrice={livePrice}
                    onTakeTrade={() => setExecuteOpen(true)}
                    minWinRate={minWinRate}
                  />
                ) : null}

                {data.data?.quant ? (
                  <QuantPanel quant={data.data.quant} minWinRate={minWinRate} onMinWinRate={setMinWinRate} />
                ) : null}

                {data.data ? <DeepDiveExtras data={data.data} /> : null}

                {item ? (
                  <>
                    <RecentTradesPanel symbol={item.symbol} assetType={item.asset_type} />
                    <Scorecard />
                  </>
                ) : null}

                {/* Prose summary — fallback for legacy cached rows without structured data */}
                {!data.data && data.content ? (
                  <Text style={styles.content}>{data.content}</Text>
                ) : null}

                <View style={styles.footerRow}>
                  <View style={styles.modelBlock}>
                    <Text style={styles.modelText}>{shortModel(data.model)}</Text>
                    {isDeepModel(data.model) ? (
                      <Text style={styles.modelHint}>deep · highest cost</Text>
                    ) : (
                      <Text style={styles.modelHint}>default · balanced</Text>
                    )}
                  </View>
                  <View style={styles.footerActions}>
                    {isDeepModel(data.model) ? (
                      <Pressable
                        onPress={() => {
                          setModelTier('fast');
                          if (analysisCache['fast']) return;
                          void loadAnalysis(false, 'fast');
                        }}
                        style={({ pressed }) => [styles.deepButton, pressed && { opacity: 0.7 }]}
                      >
                        <Ionicons name="flash" size={12} color={colors.accent} />
                        <Text style={[styles.deepText, { color: colors.accent }]}>Default</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setModelTier('deep');
                          if (analysisCache['deep']) return;
                          void loadAnalysis(false, 'deep');
                        }}
                        style={({ pressed }) => [styles.deepButton, pressed && { opacity: 0.7 }]}
                      >
                        <Ionicons name="sparkles" size={12} color={colors.warning} />
                        <Text style={styles.deepText}>Deep dive</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => {
                        // Drop the cached row so the spinner shows + force backend refresh.
                        setAnalysisCache((prev) => {
                          const next = { ...prev };
                          delete next[modelTier];
                          return next;
                        });
                        void loadAnalysis(true);
                      }}
                      style={styles.refreshButton}
                    >
                      <Ionicons name="refresh" size={14} color={colors.accent} />
                      <Text style={styles.refreshText}>Re-run</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>

      <ExecuteOrderModal
        visible={executeOpen}
        item={item}
        tradeIdea={tradeIdea ?? null}
        analysisData={data?.data ?? null}
        onClose={() => setExecuteOpen(false)}
      />
    </Modal>
  );
}

/**
 * True when the analysis was produced by the deep-dive tier. Kept as a helper
 * because the underlying model has changed over time (Opus 4.7 → Fable 5) and
 * cached rows can carry either — the check needs to work for both.
 */
function isDeepModel(model: string): boolean {
  return model.includes('opus') || model.includes('fable');
}

function shortModel(model: string): string {
  if (model.includes('haiku')) return 'Haiku 4.5';
  if (model.includes('fable')) return 'Fable 5';
  if (model.includes('opus')) return 'Opus 4.7';
  if (model.includes('sonnet')) return 'Sonnet 4.6';
  return model;
}

const HORIZON_OPTIONS: { value: AnalysisHorizon; label: string; sublabel: string }[] = [
  { value: 'intraday', label: 'Day', sublabel: 'hours' },
  { value: 'short_term', label: 'Swing', sublabel: 'days' },
  { value: 'medium_term', label: 'Position', sublabel: '1–6mo' },
  { value: 'long_term', label: 'Hold', sublabel: '6mo+' },
];

function HorizonPicker({
  value,
  onChange,
  tradeIdeas,
  primaryHorizon,
}: {
  value: AnalysisHorizon;
  onChange: (next: AnalysisHorizon) => void;
  tradeIdeas?: TradeIdeasByHorizon | null;
  primaryHorizon?: AnalysisHorizon | null;
}) {
  return (
    <View style={styles.horizonRow}>
      {HORIZON_OPTIONS.map((opt) => {
        const active = opt.value === value;
        const idea = tradeIdeas?.[opt.value] ?? null;
        const conviction = idea?.conviction ?? null;
        const isPrimary = primaryHorizon === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.horizonPill,
              active && styles.horizonPillActive,
              pressed && !active && styles.horizonPillPressed,
            ]}
            accessibilityLabel={`${opt.label} horizon${conviction ? `, conviction ${conviction} of 5` : ''}`}
          >
            <View style={styles.horizonLabelRow}>
              <Text style={[styles.horizonLabel, active && styles.horizonLabelActive]}>
                {opt.label}
              </Text>
              {isPrimary ? (
                <Ionicons
                  name="star"
                  size={9}
                  color={active ? colors.bg : colors.warning}
                  style={{ marginLeft: 3 }}
                />
              ) : null}
            </View>
            <Text style={[styles.horizonSublabel, active && styles.horizonSublabelActive]}>
              {opt.sublabel}
            </Text>
            {conviction != null ? (
              <View style={styles.horizonStarsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons
                    key={n}
                    name={n <= conviction ? 'star' : 'star-outline'}
                    size={7}
                    color={
                      active
                        ? colors.bg
                        : n <= conviction
                          ? colors.warning
                          : colors.textDim
                    }
                    style={{ marginRight: 1 }}
                  />
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function cachedAgeLabel(createdAt: string): string {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const mins = Math.max(0, Math.round(ageMs / 60_000));
  if (mins < 1) return 'Cached · just now';
  if (mins === 1) return 'Cached · 1 min ago';
  if (mins < 60) return `Cached · ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return 'Cached · 1 hour ago';
  return `Cached · ${hours} hours ago`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  backdropPress: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  headerLeft: { flex: 1, gap: 2 },
  eyebrow: { ...type.micro, color: colors.accent },
  title: { ...type.display, color: colors.text, fontSize: 26 },
  subtitle: { ...type.body, color: colors.textMuted, marginTop: 2 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { maxHeight: 640 },
  bodyContent: { gap: spacing.lg, paddingBottom: spacing.lg },
  chartUnavailable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chartUnavailableText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },
  chartUnavailableCode: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  center: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  loadingText: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
  errorBox: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  errorText: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryButtonText: { ...type.caption, color: colors.text },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cachedText: { ...type.micro, color: colors.textDim, letterSpacing: 0.3 },
  content: { ...type.body, color: colors.text, lineHeight: 24 },
  footerRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelBlock: { gap: 2 },
  modelText: { ...type.micro, color: colors.textMuted, fontWeight: '600' },
  modelHint: { ...type.micro, color: colors.textDim, fontSize: 9 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  deepText: { ...type.caption, color: colors.warning, fontWeight: '600' },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: 'rgba(124, 140, 255, 0.1)',
    borderRadius: radius.sm,
  },
  refreshText: { ...type.caption, color: colors.accent },
  horizonRow: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 4,
  },
  horizonPill: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    gap: 1,
  },
  horizonPillActive: { backgroundColor: colors.accent },
  horizonPillPressed: { backgroundColor: colors.bgElevated },
  horizonLabel: {
    ...type.caption,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.4,
    fontSize: 12,
  },
  horizonLabelActive: { color: colors.bg },
  horizonSublabel: {
    ...type.micro,
    color: colors.textDim,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  horizonSublabelActive: { color: colors.bg, opacity: 0.7 },
  horizonLabelRow: { flexDirection: 'row', alignItems: 'center' },
  horizonStarsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
});
