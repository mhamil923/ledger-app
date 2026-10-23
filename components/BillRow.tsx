import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Bill } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  bill: Bill;
  onMarkPaid: (bill: Bill) => void;
  onDelete: (bill: Bill) => void;
}

const CADENCE_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  custom: 'Custom',
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(`${iso}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today.getTime()) / (24 * 60 * 60 * 1000));
}

function dueLabel(days: number | null): { text: string; color: string } {
  if (days == null) return { text: 'No due date', color: colors.textDim };
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: colors.negative };
  if (days === 0) return { text: 'Due today', color: colors.warning };
  if (days === 1) return { text: 'Due tomorrow', color: colors.warning };
  if (days <= 7) return { text: `Due in ${days}d`, color: colors.warning };
  return { text: `Due in ${days}d`, color: colors.textMuted };
}

export function BillRow({ bill, onMarkPaid, onDelete }: Props) {
  const days = daysUntil(bill.next_due_date);
  const due = dueLabel(days);

  return (
    <View style={[styles.row, !bill.active && styles.rowInactive]}>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.nameBlock}>
            <Text style={styles.name}>{bill.name}</Text>
            {bill.merchant && bill.merchant !== bill.name ? (
              <Text style={styles.merchant}>{bill.merchant}</Text>
            ) : null}
          </View>
          <Text style={styles.amount}>{formatPrice(bill.amount)}</Text>
        </View>
        <View style={styles.bottomRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.cadence}>{CADENCE_LABEL[bill.cadence] ?? bill.cadence}</Text>
            <Text style={[styles.dueText, { color: due.color }]}>· {due.text}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => onMarkPaid(bill)}
              hitSlop={6}
              style={({ pressed }) => [styles.iconBtn, styles.payBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="checkmark" size={14} color={colors.positive} />
              <Text style={styles.payText}>Paid</Text>
            </Pressable>
            <Pressable
              onPress={() => onDelete(bill)}
              hitSlop={6}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="trash-outline" size={14} color={colors.textDim} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  rowInactive: { opacity: 0.55 },
  body: { padding: spacing.lg, gap: spacing.sm },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameBlock: { flex: 1, gap: 2 },
  name: { ...type.heading, color: colors.text },
  merchant: { ...type.micro, color: colors.textDim },
  amount: { ...type.heading, color: colors.text, fontVariant: ['tabular-nums' as const] },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaBlock: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flex: 1 },
  cadence: { ...type.caption, color: colors.textMuted },
  dueText: { ...type.caption },
  actions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  iconBtn: {
    minWidth: 32,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  payBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  payText: { ...type.micro, color: colors.positive, fontWeight: '700' },
});
