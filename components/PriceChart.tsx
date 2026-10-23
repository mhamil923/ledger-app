import { useMemo, useState, type ComponentProps } from 'react';
import {
  LayoutChangeEvent,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
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

// Internal layout dimensions
const PAD_X = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 12;
const GAP = 8;
const PRICE_H = 240;
const VOLUME_H = 56;
const RSI_H = 80;
const TOTAL_H = PAD_TOP + PRICE_H + GAP + VOLUME_H + GAP + RSI_H + PAD_BOTTOM;

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
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const useCandles = chartType === 'candle' && candles.length > 0;

  const layout = useMemo(() => {
    if (!points.length || width <= 0) return null;

    const priceTop = PAD_TOP;
    const priceBot = priceTop + PRICE_H;
    const volTop = priceBot + GAP;
    const volBot = volTop + VOLUME_H;
    const rsiTop = volBot + GAP;
    const rsiBot = rsiTop + RSI_H;

    const innerW = Math.max(width - PAD_X * 2, 1);
    const indexToX = (i: number): number => PAD_X + (i / Math.max(points.length - 1, 1)) * innerW;
    const tsToX = (ts: number): number => {
      const startTs = points[0]!.ts;
      const endTs = points[points.length - 1]!.ts;
      const span = endTs - startTs || 1;
      return PAD_X + ((ts - startTs) / span) * innerW;
    };

    // Price scale considers price points, overlays, levels, and candle highs/lows.
    const prices = points.map((p) => p.price);
    const overlayPrices = overlays.flatMap((o) => o.points.map((pp) => pp.value));
    const levelPrices = levels.map((l) => l.price).filter((p) => Number.isFinite(p));
    const candleExtremes = useCandles ? candles.flatMap((c) => [c.high, c.low]) : [];
    const allPrices = [...prices, ...overlayPrices, ...levelPrices, ...candleExtremes];
    const pMin = Math.min(...allPrices);
    const pMax = Math.max(...allPrices);
    const pSpan = pMax - pMin || 1;
    const pPad = pSpan * 0.06;
    const pYMin = pMin - pPad;
    const pYMax = pMax + pPad;
    const pYRange = pYMax - pYMin || 1;
    const priceToY = (p: number): number => priceTop + ((pYMax - p) / pYRange) * PRICE_H;

    // Volume scale: 0 → max
    let vMax = 1;
    for (const v of volumes) if (v.value > vMax) vMax = v.value;
    const volToY = (v: number): number => volBot - (v / vMax) * VOLUME_H;

    // RSI scale: 0 → 100, with a tiny pad so 0 and 100 sit just inside the box
    const rsiSeries = indicatorSeries.find((s) => s.key === 'rsi14');
    const rsiToY = (r: number): number => rsiTop + ((100 - Math.max(0, Math.min(100, r))) / 100) * RSI_H;

    // Build the main price path + area
    const pricePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${indexToX(i).toFixed(2)} ${priceToY(p.price).toFixed(2)}`)
      .join(' ');
    const areaPath = `${pricePath} L ${indexToX(points.length - 1).toFixed(2)} ${priceBot} L ${indexToX(0).toFixed(2)} ${priceBot} Z`;

    // Overlay paths
    const overlayPaths = overlays.map((o) => ({
      ...o,
      path: o.points
        .map(
          (pp, i) =>
            `${i === 0 ? 'M' : 'L'} ${tsToX(pp.ts).toFixed(2)} ${priceToY(pp.value).toFixed(2)}`,
        )
        .join(' '),
    }));

    // RSI path
    let rsiPath = '';
    if (rsiSeries && rsiSeries.points.length > 1) {
      rsiPath = rsiSeries.points
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${tsToX(p.ts).toFixed(2)} ${rsiToY(p.value).toFixed(2)}`,
        )
        .join(' ');
    }

    // Volume bar width
    const barWidth = volumes.length > 0 ? Math.max(1.5, innerW / volumes.length - 1) : 0;

    const first = useCandles ? candles[0]!.open : points[0]!.price;
    const last = useCandles ? candles[candles.length - 1]!.close : points[points.length - 1]!.price;
    const change = last - first;

    // Candle body width: ~80% of slot width, minimum 1.5px
    const candleSlot = useCandles ? innerW / Math.max(candles.length, 1) : 0;
    const candleBodyW = Math.max(1.5, candleSlot * 0.8);

    return {
      pricePath,
      areaPath,
      overlayPaths,
      rsiPath,
      rsiSeries,
      positive: change >= 0,
      change,
      changePct: first > 0 ? (change / first) * 100 : 0,
      minPrice: pMin,
      maxPrice: pMax,
      indexToX,
      tsToX,
      priceToY,
      volToY,
      rsiToY,
      barWidth,
      candleBodyW,
      priceTop,
      priceBot,
      volTop,
      volBot,
      rsiTop,
      rsiBot,
      innerW,
    };
  }, [points, candles, overlays, volumes, indicatorSeries, levels, width, useCandles]);

  const onLayout = (e: LayoutChangeEvent): void => {
    setWidth(Math.max(e.nativeEvent.layout.width, 0));
  };

  const computeHoverFromX = (x: number): void => {
    if (!layout || points.length === 0) return;
    const clampedX = Math.max(PAD_X, Math.min(layout.innerW + PAD_X, x));
    const ratio = (clampedX - PAD_X) / layout.innerW;
    const idx = Math.round(ratio * (points.length - 1));
    if (idx >= 0 && idx < points.length) setHoverIdx(idx);
  };

  const onTouchMove = (e: GestureResponderEvent): void => {
    computeHoverFromX(e.nativeEvent.locationX);
  };
  const onTouchEnd = (): void => setHoverIdx(null);

  const hasData = !!layout;
  const strokeColor = layout?.positive ? colors.positive : colors.negative;
  const gradientId = layout?.positive ? 'chartFillPos' : 'chartFillNeg';

  // Crosshair-derived values for the tooltip strip
  const hoverPoint = hoverIdx != null ? points[hoverIdx] : null;
  const hoverVolume =
    hoverPoint && volumes.length > 0
      ? nearestByTs(volumes, hoverPoint.ts)
      : null;
  const hoverRsi =
    hoverPoint && layout?.rsiSeries ? nearestByTs(layout.rsiSeries.points, hoverPoint.ts) : null;

  // Wrap the chart area in a View that captures mouse + touch events for crosshair tracking
  const interactionProps: ComponentProps<typeof View> = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: onTouchMove,
    onResponderMove: onTouchMove,
    onResponderRelease: onTouchEnd,
    onResponderTerminate: onTouchEnd,
  };
  if (Platform.OS === 'web') {
    // react-native-web supports DOM mouse events on View; cast for type-checker
    Object.assign(interactionProps, {
      onMouseMove: (e: { nativeEvent: { offsetX: number } }) =>
        computeHoverFromX(e.nativeEvent.offsetX),
      onMouseLeave: () => setHoverIdx(null),
    });
  }

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

      <View
        style={[styles.chartContainer, { height: TOTAL_H }]}
        onLayout={onLayout}
        {...interactionProps}
      >
        {hasData && width > 0 ? (
          <Svg width={width} height={TOTAL_H} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={strokeColor} stopOpacity={0.22} />
                <Stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Background separators */}
            <Line
              x1={PAD_X}
              x2={width - PAD_X}
              y1={layout.priceBot + GAP / 2}
              y2={layout.priceBot + GAP / 2}
              stroke={colors.borderSubtle}
              strokeWidth={1}
            />
            <Line
              x1={PAD_X}
              x2={width - PAD_X}
              y1={layout.volBot + GAP / 2}
              y2={layout.volBot + GAP / 2}
              stroke={colors.borderSubtle}
              strokeWidth={1}
            />

            {/* Price area fill — only when chartType === 'area' */}
            {!useCandles && chartType === 'area' ? (
              <Path d={layout.areaPath} fill={`url(#${gradientId})`} />
            ) : null}

            {/* Horizontal trade levels (drawn behind price line/candles) */}
            {levels.map((lv, i) => {
              const y = layout.priceToY(lv.price);
              if (!Number.isFinite(y) || y < layout.priceTop || y > layout.priceBot) return null;
              return (
                <Line
                  key={`lv-${i}`}
                  x1={PAD_X}
                  x2={width - PAD_X}
                  y1={y}
                  y2={y}
                  stroke={lv.color}
                  strokeWidth={1}
                  strokeDasharray={lv.style === 'solid' ? undefined : '4 4'}
                  strokeOpacity={0.7}
                />
              );
            })}

            {/* Overlays (SMAs) */}
            {layout.overlayPaths.map((o) => (
              <Path
                key={o.key}
                d={o.path}
                stroke={OVERLAY_COLOR[o.key] ?? colors.textMuted}
                strokeWidth={1.4}
                fill="none"
                strokeOpacity={0.85}
              />
            ))}

            {/* Candles OR price line */}
            {useCandles ? (
              candles.map((c, i) => {
                const x = layout.tsToX(c.ts);
                const isGreen = c.close >= c.open;
                const color = isGreen ? colors.positive : colors.negative;
                const wickTop = layout.priceToY(c.high);
                const wickBot = layout.priceToY(c.low);
                const bodyTop = layout.priceToY(Math.max(c.open, c.close));
                const bodyBot = layout.priceToY(Math.min(c.open, c.close));
                const bodyH = Math.max(1, bodyBot - bodyTop);
                return (
                  <G key={`candle-${i}`}>
                    <Line
                      x1={x}
                      x2={x}
                      y1={wickTop}
                      y2={wickBot}
                      stroke={color}
                      strokeWidth={1}
                    />
                    <Rect
                      x={x - layout.candleBodyW / 2}
                      y={bodyTop}
                      width={layout.candleBodyW}
                      height={bodyH}
                      fill={color}
                    />
                  </G>
                );
              })
            ) : (
              <Path
                d={layout.pricePath}
                stroke={strokeColor}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Volume bars */}
            {volumes.map((v, i) => {
              const x = layout.tsToX(v.ts) - layout.barWidth / 2;
              const top = layout.volToY(v.value);
              const h = layout.volBot - top;
              if (h <= 0) return null;
              // Color matches price direction at that index when possible
              const priceIdx = Math.min(i, points.length - 1);
              const prev = points[Math.max(0, priceIdx - 1)]?.price ?? 0;
              const curr = points[priceIdx]?.price ?? 0;
              const up = curr >= prev;
              return (
                <Rect
                  key={`vol-${i}`}
                  x={x}
                  y={top}
                  width={layout.barWidth}
                  height={h}
                  fill={up ? colors.positive : colors.negative}
                  opacity={0.35}
                />
              );
            })}

            {/* RSI: 30 / 70 reference lines */}
            <Line
              x1={PAD_X}
              x2={width - PAD_X}
              y1={layout.rsiToY(30)}
              y2={layout.rsiToY(30)}
              stroke={colors.positive}
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeOpacity={0.4}
            />
            <Line
              x1={PAD_X}
              x2={width - PAD_X}
              y1={layout.rsiToY(70)}
              y2={layout.rsiToY(70)}
              stroke={colors.negative}
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeOpacity={0.4}
            />
            <Line
              x1={PAD_X}
              x2={width - PAD_X}
              y1={layout.rsiToY(50)}
              y2={layout.rsiToY(50)}
              stroke={colors.textDim}
              strokeWidth={1}
              strokeDasharray="2 4"
              strokeOpacity={0.25}
            />
            {/* RSI line */}
            {layout.rsiPath ? (
              <Path
                d={layout.rsiPath}
                stroke="#7c8cff"
                strokeWidth={1.5}
                fill="none"
                strokeLinejoin="round"
              />
            ) : null}

            {/* Level labels */}
            {levels.map((lv, i) => {
              if (!lv.label) return null;
              const y = layout.priceToY(lv.price);
              if (!Number.isFinite(y) || y < layout.priceTop || y > layout.priceBot) return null;
              return (
                <SvgText
                  key={`lv-label-${i}`}
                  x={width - PAD_X - 4}
                  y={Math.max(layout.priceTop + 10, Math.min(layout.priceBot - 4, y - 3))}
                  fill={lv.color}
                  fontSize={9}
                  fontWeight="700"
                  textAnchor="end"
                >
                  {lv.label}
                </SvgText>
              );
            })}

            {/* Crosshair */}
            {hoverIdx != null && hoverPoint ? (
              <>
                <Line
                  x1={layout.indexToX(hoverIdx)}
                  x2={layout.indexToX(hoverIdx)}
                  y1={layout.priceTop}
                  y2={layout.rsiBot}
                  stroke={colors.text}
                  strokeOpacity={0.4}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <Circle
                  cx={layout.indexToX(hoverIdx)}
                  cy={layout.priceToY(hoverPoint.price)}
                  r={3.5}
                  fill={colors.text}
                />
              </>
            ) : null}
          </Svg>
        ) : !hasData && !loading ? (
          <View style={styles.placeholder}>
            <Ionicons name="bar-chart-outline" size={28} color={colors.textDim} />
          </View>
        ) : null}

        {/* Pane labels (overlay on top of SVG, absolutely positioned) */}
        {hasData ? (
          <>
            <Text style={[styles.paneLabel, { top: layout.priceTop + 2, left: PAD_X + 4 }]}>
              PRICE
            </Text>
            <Text style={[styles.paneLabel, { top: layout.volTop + 2, left: PAD_X + 4 }]}>
              VOLUME
            </Text>
            <Text style={[styles.paneLabel, { top: layout.rsiTop + 2, left: PAD_X + 4 }]}>
              RSI 14
            </Text>
          </>
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
