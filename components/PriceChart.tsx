import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  AssetType,
  Candle,
  ChartOverlay,
  ChartInterval,
  ChartPoint,
  ChartType,
  IndicatorSeries,
  VolumePoint,
} from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';
import { LivePulse } from './LivePulse';
import { TVChart, type TVChartHandle } from './TVChart';
import type { TVChartData } from '../lib/tvchart-renderer';

export interface HorizontalLevel {
  price: number;
  label?: string;
  color: string;
  style?: 'solid' | 'dashed';
}

interface Props {
  points: ChartPoint[];
  candles?: Candle[];
  overlays?: ChartOverlay[];
  volumes?: VolumePoint[];
  indicatorSeries?: IndicatorSeries[];
  levels?: HorizontalLevel[];
  /** Candle size. Older history loads automatically as you scroll/zoom back. */
  interval: ChartInterval;
  onIntervalChange?: (interval: ChartInterval) => void;
  /** Called when the view reaches the oldest loaded candle. */
  onNeedMore?: () => void;
  loadingMore?: boolean;
  /** False once the very first candle of the asset's history is loaded. */
  hasMore?: boolean;
  chartType?: ChartType;
  onChartTypeChange?: (type: ChartType) => void;
  loading?: boolean;
  symbol?: string;
  assetType?: AssetType;
  /** When true, render a small pulsing LIVE indicator on the chart header. */
  live?: boolean;
}

const INTERVALS: Array<{ id: ChartInterval; label: string }> = [
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
];
const INTRADAY = new Set<ChartInterval>(['5m', '15m', '1h', '4h']);
/** Window the header's % change is measured over, per candle size. */
const CHANGE_WINDOW: Record<ChartInterval, { ms: number; label: string }> = {
  '5m': { ms: 86_400_000, label: '24 hours' },
  '15m': { ms: 3 * 86_400_000, label: '3 days' },
  '1h': { ms: 7 * 86_400_000, label: '7 days' },
  '4h': { ms: 30 * 86_400_000, label: '30 days' },
  '1d': { ms: 365 * 86_400_000, label: '1 year' },
  '1w': { ms: 5 * 365 * 86_400_000, label: '5 years' },
};

const OVERLAY_COLOR: Record<string, string> = {
  sma20: '#7c8cff',
  sma50: '#a855f7',
};

// Chart height: price pane + volume pane + RSI pane.
const TOTAL_H = 420;

function tradingViewUrl(symbol: string, assetType: AssetType): string {
  if (assetType === 'crypto') {
    return `https://www.tradingview.com/symbols/${symbol.toUpperCase()}USD/`;
  }
  return `https://www.tradingview.com/symbols/${symbol.toUpperCase()}/`;
}

function formatDate(ts: number, interval: ChartInterval): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  if (INTRADAY.has(interval)) {
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: sameYear ? undefined : 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

function formatVolume(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

export function PriceChart({
  points,
  candles = [],
  overlays = [],
  volumes = [],
  indicatorSeries = [],
  levels = [],
  interval,
  onIntervalChange,
  onNeedMore,
  loadingMore,
  hasMore = true,
  chartType = 'area',
  onChartTypeChange,
  loading,
  symbol,
  assetType,
  live,
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const useCandles = chartType === 'candle' && candles.length > 0;

  // Header stats (the chart itself is drawn by TradingView Lightweight Charts).
  const layout = useMemo(() => {
    if (!points.length) return null;
    const cutoff = points[points.length - 1]!.ts - CHANGE_WINDOW[interval].ms;
    const winPts = points.filter((p) => p.ts >= cutoff);
    const winCandles = candles.filter((c) => c.ts >= cutoff);
    const useWinCandles = useCandles && winCandles.length > 0;
    const prices = useWinCandles ? winCandles.flatMap((c) => [c.high, c.low]) : winPts.map((p) => p.price);
    const first = useWinCandles ? winCandles[0]!.open : winPts[0]!.price;
    const last = points[points.length - 1]!.price;
    const change = last - first;
    return {
      positive: change >= 0,
      change,
      changePct: first > 0 ? (change / first) * 100 : 0,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      rsiSeries: indicatorSeries.find((x) => x.key === 'rsi14'),
    };
  }, [points, candles, indicatorSeries, useCandles, interval]);


  const hasData = !!layout;
  const strokeColor = layout?.positive ? colors.positive : colors.negative;

  // Crosshair-derived values for the tooltip strip
  const hoverPoint = hoverIdx != null ? points[hoverIdx] : null;
  const hoverVolume =
    hoverPoint && volumes.length > 0
      ? nearestByTs(volumes, hoverPoint.ts)
      : null;
  const hoverRsi =
    hoverPoint && layout?.rsiSeries ? nearestByTs(layout.rsiSeries.points, hoverPoint.ts) : null;


  // TradingView Lightweight Charts (open source) draws the panes now:
  // price (line/area/candles + SMA overlays + AI key levels), volume, RSI 14.
  const tvData = useMemo<TVChartData>(
    () => ({
      mode: useCandles ? 'candle' : chartType === 'line' ? 'line' : 'area',
      points,
      candles,
      overlays: overlays.map((o) => ({
        key: o.key,
        label: o.label,
        color: OVERLAY_COLOR[o.key] ?? colors.textMuted,
        points: o.points,
      })),
      volumes,
      rsi: indicatorSeries.find((x) => x.key === 'rsi14')?.points ?? [],
      levels,
      intraday: INTRADAY.has(interval),
      hasMore,
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
      colors: {
        bg: colors.bgCard,
        text: colors.textMuted,
        grid: colors.border,
        up: colors.positive,
        down: colors.negative,
        rsi: '#f59e0b',
      },
    }),
    [points, candles, overlays, volumes, indicatorSeries, levels, interval, chartType, useCandles, hasMore],
  );
  const chartRef = useRef<TVChartHandle>(null);
  const onCrosshair = useCallback(
    (ts: number | null): void => {
      if (ts == null || points.length === 0) {
        setHoverIdx(null);
        return;
      }
      let best = 0;
      let bestDelta = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(points[i]!.ts - ts);
        if (d < bestDelta) {
          bestDelta = d;
          best = i;
        }
      }
      setHoverIdx(best);
    },
    [points],
  );

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.statBlock}>
          {hoverPoint ? (
            <>
              <Text style={[styles.changeText, { color: colors.text }]}>
                {formatPrice(hoverPoint.price)}
              </Text>
              <Text style={styles.rangeNote}>
                {formatDate(hoverPoint.ts, interval)}
                {hoverVolume != null ? ` · vol ${formatVolume(hoverVolume)}` : ''}
                {hoverRsi != null ? ` · RSI ${hoverRsi.toFixed(0)}` : ''}
              </Text>
            </>
          ) : hasData ? (
            <>
              <View style={styles.changeRow}>
                <Text style={[styles.changeText, { color: strokeColor }]}>
                  {layout.positive ? '▲' : '▼'} {formatPrice(Math.abs(layout.change))} (
                  {layout.changePct >= 0 ? '+' : ''}
                  {layout.changePct.toFixed(2)}%)
                </Text>
                {live ? <LivePulse active /> : null}
              </View>
              <Text style={styles.rangeNote}>
                over {CHANGE_WINDOW[interval].label} · {formatPrice(layout.minPrice)} –{' '}
                {formatPrice(layout.maxPrice)}
              </Text>
            </>
          ) : (
            <Text style={styles.rangeNote}>{loading ? 'Loading chart…' : 'No chart data'}</Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {onChartTypeChange ? (
            <View style={styles.typeToggle}>
              {(['line', 'area', 'candle'] as const).map((t) => {
                const active = chartType === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => onChartTypeChange(t)}
                    style={({ pressed }) => [
                      styles.typePill,
                      active && styles.typePillActive,
                      pressed && !active && styles.typePillPressed,
                    ]}
                    accessibilityLabel={`${t} chart`}
                  >
                    <Ionicons
                      name={
                        t === 'line'
                          ? 'analytics-outline'
                          : t === 'area'
                            ? 'trending-up-outline'
                            : 'stats-chart-outline'
                      }
                      size={12}
                      color={active ? colors.bg : colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {symbol && assetType ? (
            <Pressable
              onPress={() => void Linking.openURL(tradingViewUrl(symbol, assetType))}
              style={({ pressed }) => [styles.tvLink, pressed && styles.tvLinkPressed]}
              accessibilityLabel={`Open ${symbol} in TradingView`}
            >
              <Ionicons name="open-outline" size={12} color={colors.accent} />
              <Text style={styles.tvLinkText}>Advanced</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={[styles.chartContainer, { height: TOTAL_H }]}>
        {hasData ? (
          <>
            <TVChart ref={chartRef} data={tvData} height={TOTAL_H} onCrosshair={onCrosshair} onNeedMore={onNeedMore} />
            {loadingMore || !hasMore ? (
              <View style={styles.historyNote} pointerEvents="none">
                <Text style={styles.historyNoteText}>
                  {loadingMore ? 'Loading older history…' : 'Start of available history'}
                </Text>
              </View>
            ) : null}
            <View style={styles.zoomCol} pointerEvents="box-none">
              <ZoomBtn icon="add" label="Zoom in" onPress={() => chartRef.current?.zoom(1.6)} />
              <ZoomBtn icon="remove" label="Zoom out" onPress={() => chartRef.current?.zoom(1 / 1.6)} />
              <ZoomBtn icon="scan-outline" label="Fit all" onPress={() => chartRef.current?.fit()} />
            </View>
          </>
        ) : !loading ? (
          <View style={styles.placeholder}>
            <Ionicons name="bar-chart-outline" size={28} color={colors.textDim} />
          </View>
        ) : null}
      </View>

      {/* Legend for overlays */}
      {overlays.length > 0 ? (
        <View style={styles.legend}>
          {overlays.map((o) => (
            <View key={o.key} style={styles.legendItem}>
              <View
                style={[styles.legendSwatch, { backgroundColor: OVERLAY_COLOR[o.key] ?? colors.textMuted }]}
              />
              <Text style={styles.legendText}>{o.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {onIntervalChange ? (
        <View style={styles.rangeRow}>
          {INTERVALS.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => onIntervalChange(r.id)}
              accessibilityLabel={`${r.label} candles`}
              style={({ pressed }) => [
                styles.rangePill,
                interval === r.id && styles.rangePillActive,
                pressed && interval !== r.id && styles.rangePillPressed,
              ]}
            >
              <Text style={[styles.rangePillText, interval === r.id && styles.rangePillTextActive]}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.hintText}>Scroll or zoom out to load older history · drag the axes to stretch</Text>
    </View>
  );
}

function ZoomBtn({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.zoomBtn, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={14} color={colors.text} />
    </Pressable>
  );
}

function nearestByTs(arr: { ts: number; value: number }[], ts: number): number | null {
  if (arr.length === 0) return null;
  let bestIdx = 0;
  let bestDelta = Math.abs(arr[0]!.ts - ts);
  for (let i = 1; i < arr.length; i++) {
    const d = Math.abs(arr[i]!.ts - ts);
    if (d < bestDelta) {
      bestDelta = d;
      bestIdx = i;
    }
  }
  return arr[bestIdx]!.value;
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  statBlock: { gap: 2 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  changeText: { ...type.heading, fontVariant: ['tabular-nums' as const] },
  rangeNote: { ...type.micro, color: colors.textDim, fontVariant: ['tabular-nums' as const] },
  chartContainer: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  paneLabel: {
    position: 'absolute',
    ...type.micro,
    color: colors.textDim,
    fontSize: 8,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  legend: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 8, height: 2, borderRadius: 1 },
  legendText: { ...type.micro, color: colors.textMuted, fontSize: 10 },
  rangeRow: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 4,
  },
  rangePill: { flex: 1, paddingVertical: spacing.xs + 2, alignItems: 'center', borderRadius: radius.sm },
  rangePillActive: { backgroundColor: colors.accent },
  rangePillPressed: { backgroundColor: colors.bgElevated },
  rangePillText: { ...type.micro, color: colors.textMuted, letterSpacing: 0.5 },
  rangePillTextActive: { color: colors.bg, fontWeight: '700' },
  tvLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    backgroundColor: 'rgba(124, 140, 255, 0.10)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(124, 140, 255, 0.25)',
  },
  tvLinkPressed: { opacity: 0.7 },
  tvLinkText: { ...type.micro, color: colors.accent, fontWeight: '700', letterSpacing: 0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 2,
    gap: 1,
  },
  typePill: {
    width: 26,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm - 1,
  },
  typePillActive: { backgroundColor: colors.accent },
  typePillPressed: { backgroundColor: colors.bgElevated },
  zoomCol: { position: 'absolute', top: 8, left: 8, gap: 4 },
  zoomBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(24, 24, 27, 0.85)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyNote: {
    position: 'absolute',
    top: 8,
    left: 44,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(24, 24, 27, 0.85)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyNoteText: { ...type.micro, color: colors.textMuted },
  hintText: { ...type.micro, color: colors.textDim, textAlign: 'center' },
});
