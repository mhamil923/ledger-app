import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EnvelopeCategory } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  category: EnvelopeCategory;
  onPress: () => void;
}

export function formatMoney(value: number): string {
  const abs = Math.abs(value);
  const s = `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return value < 0 ? `−${s}` : s;
}

/**
 * One envelope: Budgeted / Spent / Available, like Actual's budget table.
 * The Available pill is green when there's money left, amber when it's
 * empty and red when overspent.
 */
export function BudgetCategoryRow({ category, onPress }: Props) {
  const { budgeted, activity, balance, carryover } = category;
  const spent = -activity;
  const funds = Math.max(0, carryover + budgeted);
  const pct = funds > 0 ? Math.max(0, Math.min(1, spent / funds)) : spent > 0 ? 1 : 0;
  const over = balance < -0.004;
  const empty = !over && Math.abs(balance) < 0.005;
  const pillBg = over ? 'rgba(239, 68, 68, 0.14)' : empty ? colors.bgElevated : 'rgba(34, 197, 94, 0.12)';
  const pillFg = over ? colors.negative : empty ? colors.textDim : colors.positive;
  const barColor = over ? colors.negative : pct > 0.85 ? colors.warning : colors.accent;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${formatMoney(balance)} available`}
    >
      <View style={styles.top}>
        <View style={styles.nameWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {category.name}
          </Text>
          {category.bill ? (
            <Text style={styles.billMeta} numberOfLines={1}>
              {category.bill.cadence} · {formatPrice(category.bill.amount)}
              {category.bill.next_due_date ? ` · due ${shortDate(category.bill.next_due_date)}` : ''}
            </Text>
          ) : null}
        </View>
        <View style={[styles.pill, { backgroundColor: pillBg }]}>
          <Text style={[styles.pillText, { color: pillFg }]}>{formatMoney(balance)}</Text>
        </View>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaText}>
          Budgeted <Text style={styles.metaNum}>{formatMoney(budgeted)}</Text>
        </Text>
        <Text style={styles.metaText}>
          Spent <Text style={styles.metaNum}>{formatMoney(spent)}</Text>
        </Text>
        {Math.abs(carryover) >= 0.005 ? (
          <Text style={styles.metaText}>
            <Ionicons name="return-down-forward" size={10} color={colors.textDim} /> {formatMoney(carryover)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameWrap: { flex: 1, gap: 1 },
  name: { ...type.heading, color: colors.text, fontSize: 15 },
  billMeta: { ...type.micro, color: colors.textDim, textTransform: 'capitalize' },
  pill: { paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.sm },
  pillText: { ...type.caption, fontWeight: '700', fontVariant: ['tabular-nums' as const] },
  barBg: { height: 5, borderRadius: 3, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  meta: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  metaText: { ...type.micro, color: colors.textDim },
  metaNum: { color: colors.textMuted, fontVariant: ['tabular-nums' as const] },
});
