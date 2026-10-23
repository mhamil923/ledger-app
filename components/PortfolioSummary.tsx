import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PortfolioTotals } from '../lib/api';
import { formatPercent, formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

export function PortfolioSummary({ totals }: { totals: PortfolioTotals }) {
  const positive = totals.unrealized_pl >= 0;
  const plColor = positive ? colors.positive : colors.negative;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>TOTAL VALUE</Text>
      <Text style={styles.value}>{formatPrice(totals.total_value)}</Text>

      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>COST BASIS</Text>
          <Text style={styles.metricValue}>{formatPrice(totals.total_cost)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>UNREALIZED P&L</Text>
          <View style={styles.plRow}>
            <Ionicons
              name={positive ? 'caret-up' : 'caret-down'}
              size={12}
              color={plColor}
              style={{ marginRight: 2 }}
            />
            <Text style={[styles.metricValue, { color: plColor }]}>
              {formatPrice(Math.abs(totals.unrealized_pl))}
            </Text>
            <Text style={[styles.pct, { color: plColor }]}>
              {' '}({formatPercent(totals.unrealized_pl_pct)})
            </Text>
          </View>
        </View>
      </View>

      {totals.unpriced_holdings > 0 ? (
        <View style={styles.warning}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.warningText}>
            {totals.unpriced_holdings} holding{totals.unpriced_holdings > 1 ? 's' : ''} without a live price — totals fall back to cost basis
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  value: { ...type.display, color: colors.text, fontSize: 32, fontVariant: ['tabular-nums' as const] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  metric: { flex: 1, gap: spacing.xs },
  divider: { width: 1, height: 32, backgroundColor: colors.borderSubtle, marginHorizontal: spacing.lg },
  metricLabel: { ...type.micro, color: colors.textDim, letterSpacing: 0.5 },
  metricValue: { ...type.heading, color: colors.text, fontVariant: ['tabular-nums' as const] },
  plRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  pct: { ...type.caption, fontVariant: ['tabular-nums' as const] },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  warningText: { ...type.caption, color: colors.warning, flex: 1 },
});
