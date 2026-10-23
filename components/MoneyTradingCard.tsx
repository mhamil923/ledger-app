import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../lib/api';
import { colors, radius, spacing, type } from '../theme/colors';
import { formatMoney } from './BudgetCategoryRow';

/**
 * "Both worlds" summary at the top of the home screen: budget cash on the
 * left, capital in trades on the right, tied together by the Investing
 * envelope (money you sent to a brokerage or exchange this month).
 */
export function MoneyTradingCard() {
  const router = useRouter();
  const q = useQuery({ queryKey: ['overview'], queryFn: apiClient.getOverview, staleTime: 60_000 });
  const o = q.data;
  if (q.isError) return null;

  const tb = o?.budget.to_budget ?? 0;
  const inv = o?.budget.investing_envelope_available;
  const moved = o?.budget.moved_to_trading_this_month ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.netRow}>
        <Text style={styles.netLabel}>NET WORTH</Text>
        <Text style={styles.netValue}>{o ? formatMoney(o.net_worth) : '—'}</Text>
      </View>
      <View style={styles.cols}>
        <Pressable
          style={({ pressed }) => [styles.col, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/(tabs)/budget')}
          accessibilityRole="button"
          accessibilityLabel="Open budget"
        >
          <View style={styles.colHead}>
            <Ionicons name="wallet-outline" size={13} color={colors.accent} />
            <Text style={styles.colTitle}>MONEY</Text>
          </View>
          <Text style={[styles.big, { color: tb < 0 ? colors.negative : tb > 0 ? colors.positive : colors.text }]}>
            {o ? formatMoney(tb) : '—'}
          </Text>
          <Text style={styles.bigLabel}>to budget</Text>
          <Line label="Cash" value={o?.budget.cash} />
          <Line label="Cards owed" value={o?.budget.credit_card_debt} />
          <Line label="Spent this month" value={o?.budget.spent_this_month} />
          {o && o.budget.uncategorized_count > 0 ? (
            <Text style={styles.warn}>{o.budget.uncategorized_count} to categorize</Text>
          ) : null}
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={({ pressed }) => [styles.col, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/(tabs)/portfolio')}
          accessibilityRole="button"
          accessibilityLabel="Open portfolio"
        >
          <View style={styles.colHead}>
            <Ionicons name="trending-up" size={13} color={colors.accent} />
            <Text style={styles.colTitle}>TRADING</Text>
          </View>
          <Text style={styles.big}>{o ? formatMoney(o.trading.capital_in_trades) : '—'}</Text>
          <Text style={styles.bigLabel}>capital in trades</Text>
          <Line
            label="Holdings P/L"
            value={o?.trading.holdings_unrealized_pl}
            color={(o?.trading.holdings_unrealized_pl ?? 0) >= 0 ? colors.positive : colors.negative}
          />
          <Line label="Moved in this month" value={moved} />
          {o && o.trading.alpaca_paper_equity > 0 ? (
            <Line label="Paper (not counted)" value={o.trading.alpaca_paper_equity} dim />
          ) : null}
        </Pressable>
      </View>
      {inv != null ? (
        <Text style={styles.bridge}>
          {inv < 0
            ? `You've sent ${formatMoney(moved)} to trading this month, ${formatMoney(-inv)} more than your Investing envelope had. Cover it from To Budget or another envelope.`
            : moved > 0
              ? `Investing envelope: ${formatMoney(inv)} left after moving ${formatMoney(moved)} to trading this month.`
              : `Investing envelope: ${formatMoney(inv)} ready to move into trading.`}
        </Text>
      ) : null}
    </View>
  );
}

function Line({ label, value, color, dim }: { label: string; value: number | undefined; color?: string; dim?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, dim && { color: colors.textDim }]}>{label}</Text>
      <Text style={[styles.lineValue, color ? { color } : null, dim && { color: colors.textDim }]}>
        {value == null ? '—' : formatMoney(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  netLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  netValue: { ...type.heading, color: colors.text, fontVariant: ['tabular-nums' as const] },
  cols: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1, gap: 3 },
  divider: { width: 1, backgroundColor: colors.border },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  colTitle: { ...type.micro, color: colors.accent, letterSpacing: 0.8, fontWeight: '700' },
  big: { ...type.title, color: colors.text, fontVariant: ['tabular-nums' as const] },
  bigLabel: { ...type.micro, color: colors.textDim, marginBottom: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  lineLabel: { ...type.micro, color: colors.textMuted, flexShrink: 1 },
  lineValue: { ...type.micro, color: colors.text, fontVariant: ['tabular-nums' as const] },
  warn: { ...type.micro, color: colors.warning, marginTop: 2 },
  bridge: { ...type.micro, color: colors.textMuted, lineHeight: 16, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.sm },
});
