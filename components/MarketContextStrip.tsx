import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { IndicatorSnapshot, MarketSentiment } from '../lib/api';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  indicators?: IndicatorSnapshot;
  sentiment?: MarketSentiment | null;
}

const RSI_COLOR: Record<string, string> = {
  oversold: colors.positive,
  overbought: colors.negative,
  neutral: colors.textMuted,
};

const MACD_COLOR: Record<string, string> = {
  bullish_cross: colors.positive,
  bullish: colors.positive,
  bearish_cross: colors.negative,
  bearish: colors.negative,
};

const MACD_LABEL: Record<string, string> = {
  bullish_cross: 'BULL CROSS',
  bullish: 'BULLISH',
  bearish_cross: 'BEAR CROSS',
  bearish: 'BEARISH',
};

function fearGreedColor(value: number): string {
  if (value <= 24) return colors.negative;
  if (value <= 44) return colors.warning;
  if (value <= 55) return colors.textMuted;
  if (value <= 75) return colors.positive;
  return colors.warning;
}

export function MarketContextStrip({ indicators, sentiment }: Props) {
  const hasAnything = !!indicators || !!sentiment;
  if (!hasAnything) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {sentiment ? (
        <Pill
          label="MARKET"
          value={`${sentiment.fear_greed_index} · ${sentiment.fear_greed_label}`}
          color={fearGreedColor(sentiment.fear_greed_index)}
          icon="pulse"
        />
      ) : null}
      {indicators?.rsi14 != null && indicators.rsi14_state ? (
        <Pill
          label="RSI 14"
          value={`${indicators.rsi14.toFixed(1)} · ${indicators.rsi14_state.toUpperCase()}`}
          color={RSI_COLOR[indicators.rsi14_state] ?? colors.textMuted}
        />
      ) : null}
      {indicators?.macd_state ? (
        <Pill
          label="MACD"
          value={MACD_LABEL[indicators.macd_state] ?? indicators.macd_state.toUpperCase()}
          color={MACD_COLOR[indicators.macd_state] ?? colors.textMuted}
        />
      ) : null}
      {indicators?.price_vs_sma20_pct != null ? (
        <Pill
          label="VS SMA20"
          value={`${indicators.price_vs_sma20_pct >= 0 ? '+' : ''}${indicators.price_vs_sma20_pct.toFixed(2)}%`}
          color={indicators.price_vs_sma20_pct >= 0 ? colors.positive : colors.negative}
        />
      ) : null}
      {indicators?.price_vs_sma50_pct != null ? (
        <Pill
          label="VS SMA50"
          value={`${indicators.price_vs_sma50_pct >= 0 ? '+' : ''}${indicators.price_vs_sma50_pct.toFixed(2)}%`}
          color={indicators.price_vs_sma50_pct >= 0 ? colors.positive : colors.negative}
        />
      ) : null}
    </ScrollView>
  );
}

function Pill({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.pill, { borderColor: `${color}44` }]}>
      <View style={styles.pillTop}>
        {icon ? <Ionicons name={icon} size={9} color={colors.textDim} /> : null}
        <Text style={styles.pillLabel}>{label}</Text>
      </View>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.sm, paddingVertical: 2 },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 96,
    gap: 2,
  },
  pillTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillLabel: { ...type.micro, color: colors.textDim, letterSpacing: 0.5, fontSize: 9 },
  pillValue: {
    ...type.caption,
    fontWeight: '700',
    fontVariant: ['tabular-nums' as const],
    fontSize: 12,
  },
});
