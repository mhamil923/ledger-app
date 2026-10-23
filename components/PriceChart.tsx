import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  AssetType,
  Candle,
  ChartOverlay,
  ChartPoint,
  ChartRange,
  ChartType,
  IndicatorSeries,
  VolumePoint,
} from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';
import { LivePulse } from './LivePulse';
import { TVChart } from './TVChart';
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
  range: ChartRange;
  onRangeChange?: (range: ChartRange) => void;
  chartType?: ChartType;
  onChartTypeChange?: (type: ChartType) => void;
  loading?: boolean;
  symbol?: string;
  assetType?: AssetType;
  /** When true, render a small pulsing LIVE indicator on the chart header. */
  live?: boolean;
}

const RANGES: ChartRange[] = ['1d', '7d', '30d', '90d', '1y'];

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

function formatDate(ts: number, range: ChartRange): string {
  const d = new Date(ts);
  if (range === '1d') {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  range,
  onRangeChange,
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
    const prices = useCandles ? candles.flatMap((c) => [c.high, c.low]) : points.map((p) => p.price);
    const first = useCandles ? candles[0]!.open : points[0]!.price;
    const last = useCandles ? candles[candles.length - 1]!.close : points[points.length - 1]!.price;
    const change = last - first;
    return {
      positive: change >= 0,
      change,
      changePct: first > 0 ? (change / first) * 100 : 0,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      rsiSeries: indicatorSeries.find((x) => x.key === 'rsi14'),
    };
  }, [points, candles, indicatorSeries, useCandles]);


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
      intraday: range === '1d' || range === '7d',
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
    [points, candles, overlays, volumes, indicatorSeries, levels, range, chartType, useCandles],
  );
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
                {formatDate(hoverPoint.ts, range)}
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
                over {rangeLabel(range)} · {formatPrice(layout.minPrice)} –{' '}
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
          <TVChart data={tvData} height={TOTAL_H} onCrosshair={onCrosshair} />
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

      {onRangeChange ? (
        <View style={styles.rangeRow}>
          {RANGES.map((r) => (
            <Pressable
              key={r}
              onPress={() => onRangeChange(r)}
              style={({ pressed }) => [
                styles.rangePill,
                range === r && styles.rangePillActive,
                pressed && range !== r && styles.rangePillPressed,
              ]}
            >
              <Text style={[styles.rangePillText, range === r && styles.rangePillTextActive]}>
                {r.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
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

function rangeLabel(range: ChartRange): string {
  switch (range) {
    case '1d':
      return '24 hours';
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
    case '90d':
      return '90 days';
    case '1y':
      return '1 year';
  }
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
});
