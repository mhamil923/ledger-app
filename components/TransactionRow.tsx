import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BankAccount, BankTransaction } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  txn: BankTransaction;
  account?: BankAccount;
  onPress?: () => void;
}

/**
 * One transaction row for the Spending tab. Shows the stored category (with a
 * sparkle when Claude picked it), TRANSFER for card payments / transfers
 * between your accounts, and UNCATEGORIZED for spending that isn't filed yet. SimpleFIN signs amounts as
 * negative for outflows (spend) and positive for inflows (income/refund),
 * so we use that to color and prefix the figure.
 */
export function TransactionRow({ txn, account, onPress }: Props) {
  const isSpend = txn.amount < 0;
  const isTransfer = !!txn.is_transfer;
  // Transfers get a muted color so the eye passes over them — they don't
  // contribute to spending totals.
  const amountColor = isTransfer
    ? colors.textDim
    : isSpend
      ? colors.text
      : colors.positive;
  const amountPrefix = isSpend ? '−' : '+';

  const offBudget = txn.on_budget === false;
  const uncategorized = !isTransfer && !offBudget && !txn.category_id && txn.amount < 0;
  const inferredIncome = !isTransfer && !offBudget && !txn.category_id && txn.amount > 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, isTransfer && styles.rowTransfer, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={
            isTransfer
              ? 'swap-horizontal-outline'
              : isSpend
                ? 'arrow-up-outline'
                : 'arrow-down-outline'
          }
          size={14}
          color={
            isTransfer
              ? colors.textDim
              : isSpend
                ? colors.textMuted
                : colors.positive
          }
        />
      </View>
      <View style={styles.body}>
        <Text
          style={[styles.description, isTransfer && { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {txn.merchant ?? txn.description}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaDim}>{formatDate(txn.posted_at)}</Text>
          {account ? <Text style={styles.metaDim}>·</Text> : null}
          {account ? (
            <Text style={styles.meta} numberOfLines={1}>
              {accountShort(account)}
            </Text>
          ) : null}
          {isTransfer ? (
            <View style={styles.transferPill}>
              <Text style={styles.transferText}>TRANSFER</Text>
            </View>
          ) : null}
          {txn.pending ? (
            <View style={styles.pendingPill}>
              <Text style={styles.pendingText}>PENDING</Text>
            </View>
          ) : null}
          {txn.category_name && !isTransfer ? (
            <View style={styles.categoryPill}>
              {txn.category_source === 'ai' ? (
                <Ionicons name="sparkles-outline" size={9} color={colors.textMuted} />
              ) : null}
              <Text style={styles.categoryText}>{txn.category_name}</Text>
            </View>
          ) : null}
          {uncategorized ? (
            <View style={styles.pendingPill}>
              <Text style={styles.pendingText}>UNCATEGORIZED</Text>
            </View>
          ) : null}
          {inferredIncome ? <Text style={styles.metaDim}>income</Text> : null}
          {offBudget ? <Text style={styles.metaDim}>off budget</Text> : null}
        </View>
      </View>
      <Text style={[styles.amount, { color: amountColor }]}>
        {amountPrefix}
        {formatPrice(Math.abs(txn.amount))}
      </Text>
    </Pressable>
  );
}

function accountShort(a: BankAccount): string {
  if (a.mask) return `${a.institution ?? a.name} ··${a.mask}`;
  return a.institution ?? a.name;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isThisYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: isThisYear ? undefined : '2-digit',
  });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowTransfer: { opacity: 0.55 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  description: { ...type.heading, color: colors.text, fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  meta: { ...type.micro, color: colors.textMuted, flexShrink: 1 },
  metaDim: { ...type.micro, color: colors.textDim },
  pendingPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(255, 159, 10, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.3)',
    borderRadius: radius.sm,
  },
  transferPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(124, 140, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 140, 255, 0.3)',
    borderRadius: radius.sm,
  },
  transferText: {
    ...type.micro,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  categoryText: { ...type.micro, color: colors.textMuted, fontSize: 10, letterSpacing: 0.2 },
  pendingText: {
    ...type.micro,
    color: colors.warning,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  amount: {
    ...type.heading,
    fontVariant: ['tabular-nums' as const],
    fontSize: 15,
  },
});
