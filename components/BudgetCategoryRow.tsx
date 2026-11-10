import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { EnvelopeCategory } from '../lib/api';
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

/** Whole dollars when it's a round number, cents otherwise ($1,850 / $12.95). */
export function money(value: number): string {
  const abs = Math.abs(value);
  const round = Math.abs(abs - Math.round(abs)) < 0.005;
  const s = `$${abs.toLocaleString('en-US', { minimumFractionDigits: round ? 0 : 2, maximumFractionDigits: round ? 0 : 2 })}`;
  return value < -0.004 ? `−${s}` : s;
}

/** Column labels shown once above each group's rows. */
export function BudgetColumnsHeader() {
  const { width } = useWindowDimensions();
  if (width < 640) return null; // phones use the stacked row layout
  return (
    <View style={styles.headerRow}>
      <Text style={[styles.headerText, { flex: 1 }]}>CATEGORY</Text>
      <Text style={[styles.headerText, styles.col]}>PLANNED</Text>
      <Text style={[styles.headerText, styles.col]}>SPENT</Text>
      <Text style={[styles.headerText, styles.col]}>LEFT</Text>
    </View>
  );
}

/**
 * One budget category as a row: Planned (this month) · Spent · Left.
 * "Left" includes anything carried over from last month.
 * Yearly/quarterly bills show how much has been saved toward the next bill.
 */
export function BudgetCategoryRow({ category, onPress }: Props) {
  const { budgeted, activity, balance, carryover, bill } = category;
  const narrow = useWindowDimensions().width < 640;
  const spent = Math.max(0, -activity);
  const refund = activity > 0.004;
  const over = balance < -0.004;
  const sinking = bill && bill.cadence !== 'monthly' && bill.cadence !== 'weekly' && bill.cadence !== 'biweekly';

  let sub: string | null = null;
  let barPct: number;
  let barColor: string;
  if (sinking && bill) {
    const saved = Math.max(0, balance);
    barPct = bill.amount > 0 ? Math.min(1, saved / bill.amount) : 0;
    barColor = barPct >= 1 ? colors.positive : colors.accent;
    sub = `${money(bill.amount)} ${CADENCE[bill.cadence] ?? ''}${bill.next_due_date ? ` · due ${shortDate(bill.next_due_date)}` : ''} · saved ${money(saved)} of ${money(bill.amount)}`;
  } else {
    const funds = Math.max(0, carryover + budgeted);
    barPct = funds > 0 ? Math.min(1, spent / funds) : spent > 0 ? 1 : 0;
    barColor = over ? colors.negative : barPct > 0.9 ? colors.warning : colors.accent;
    if (bill) {
      sub = `${money(bill.amount)} ${CADENCE[bill.cadence] ?? ''}${bill.next_due_date ? ` · next due ${shortDate(bill.next_due_date)}` : ''}${spent >= bill.amount - 0.01 ? ' · paid ✓' : ''}`;
    } else if (Math.abs(carryover) >= 0.005) {
      sub = `${carryover > 0 ? 'includes' : 'minus'} ${money(Math.abs(carryover))} ${carryover > 0 ? 'left over' : 'overspent'} from last month`;
    }
  }

  const leftColor = over ? colors.negative : balance > 0.004 ? colors.positive : colors.textDim;

  const leftText = over ? `${money(-balance)} over` : `${money(balance)} left`;

  if (narrow) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`${category.name}: planned ${money(budgeted)}, spent ${money(spent)}, ${leftText}`}
      >
        <View style={styles.line}>
          <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
            {category.name}
          </Text>
          <Text style={[styles.num, styles.left, { color: leftColor, fontSize: 15 }]}>{leftText}</Text>
        </View>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${barPct * 100}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={styles.sub}>
          Planned <Text style={styles.subNum}>{money(budgeted)}</Text> · Spent{' '}
          <Text style={styles.subNum}>{refund ? `+${money(activity)} refund` : money(spent)}</Text>
          {sub ? ` · ${sub}` : ''}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}: planned ${money(budgeted)}, spent ${money(spent)}, ${leftText}`}
    >
      <View style={styles.line}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {category.name}
          </Text>
          {sub ? (
            <Text style={styles.sub} numberOfLines={2}>
              {sub}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.num, styles.col, budgeted === 0 && styles.dim]}>{money(budgeted)}</Text>
        <Text style={[styles.num, styles.col, spent === 0 && !refund && styles.dim]}>
          {refund ? `+${money(activity)}` : money(spent)}
        </Text>
        <View style={styles.col}>
          <Text style={[styles.num, styles.left, { color: leftColor }]}>{over ? `−${money(-balance)}` : money(balance)}</Text>
          {over ? <Text style={styles.overTag}>over</Text> : null}
        </View>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${barPct * 100}%`, backgroundColor: barColor }]} />
      </View>
    </Pressable>
  );
}

const CADENCE: Record<string, string> = { annual: 'yearly', quarterly: 'quarterly', monthly: 'monthly', weekly: 'weekly', biweekly: 'every 2 weeks', custom: '' };

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const COL = 76;

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.xs },
  headerText: { ...type.micro, fontSize: 10, color: colors.textDim, letterSpacing: 0.6 },
  col: { width: COL, textAlign: 'right', alignItems: 'flex-end' },
  row: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 8,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...type.heading, color: colors.text, fontSize: 15 },
  sub: { ...type.micro, color: colors.textDim, marginTop: 2, lineHeight: 15 },
  subNum: { color: colors.textMuted, fontVariant: ['tabular-nums' as const] },
  num: { ...type.caption, color: colors.text, fontSize: 14, fontVariant: ['tabular-nums' as const] },
  dim: { color: colors.textDim },
  left: { fontWeight: '700' },
  overTag: { ...type.micro, fontSize: 9, color: colors.negative, letterSpacing: 0.5 },
  barBg: { height: 4, borderRadius: 2, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
});
