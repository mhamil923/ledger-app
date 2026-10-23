import { StyleSheet, Text, View } from 'react-native';
import type { HoldingSummary } from '../lib/api';
import { colors, radius, spacing, type } from '../theme/colors';

// Distinct hues that read clearly on the dark background.
const PALETTE = [
  '#7c8cff',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#eab308',
  '#f97316',
  '#3b82f6',
];

export function colorForIndex(idx: number): string {
  return PALETTE[idx % PALETTE.length]!;
}

export function AllocationBar({ holdings }: { holdings: HoldingSummary[] }) {
  const pricedHoldings = holdings.filter((h) => (h.market_value ?? h.total_cost) > 0);
  const total = pricedHoldings.reduce((acc, h) => acc + (h.market_value ?? h.total_cost), 0);
  if (total <= 0 || pricedHoldings.length === 0) return null;

  const slices = pricedHoldings.map((h, i) => ({
    id: h.id,
    symbol: h.symbol,
    pct: ((h.market_value ?? h.total_cost) / total) * 100,
    color: colorForIndex(i),
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>ALLOCATION</Text>
      <View style={styles.bar}>
        {slices.map((s) => (
          <View
            key={s.id}
            style={[styles.slice, { backgroundColor: s.color, flex: s.pct }]}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {slices.slice(0, 8).map((s) => (
          <View key={s.id} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>
              {s.symbol} <Text style={styles.legendPct}>{s.pct.toFixed(1)}%</Text>
            </Text>
          </View>
        ))}
        {slices.length > 8 ? (
          <Text style={styles.legendText}>+{slices.length - 8} more</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, marginTop: spacing.md },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
  },
  slice: { height: '100%' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.caption, color: colors.textMuted },
  legendPct: { color: colors.text, fontWeight: '600' },
});
