import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BankAccount, BankTransaction } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  txn: BankTransaction;
  account?: BankAccount;
}

/**
 * One transaction row for the Spending tab. SimpleFIN signs amounts as
 * negative for outflows (spend) and positive for inflows (income/refund),
 * so we use that to color and prefix the figure.
 */
export function TransactionRow({ txn, account }: Props) {
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

  return (
    <View style={[styles.row, isTransfer && styles.rowTransfer]}>
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
        </View>
      </View>
      <Text style={[styles.amount, { color: amountColor }]}>
        {amountPrefix}
        {formatPrice(Math.abs(txn.amount))}
      </Text>
    </View>
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
