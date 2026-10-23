import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExchangeAccount } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  account: Extract<ExchangeAccount, { provider: 'coinbase' }>;
}

/**
 * Coinbase summary card for the Accounts page. Shows total USD value plus an
 * expandable breakdown of each currency held. Collapses by default to avoid
 * blowing up the page for accounts with many altcoins.
 */
export function ExchangeAccountCard({ account }: Props) {
  const [expanded, setExpanded] = useState(false);
  const total = account.total_usd_value ?? 0;
  const balances = account.balances ?? [];
  const usdCash = account.usd_balance ?? 0;

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setExpanded((e) => !e)} style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="logo-bitcoin" size={20} color={colors.accent} />
        </View>
        <View style={styles.headerBody}>
          <Text style={styles.label}>{account.label}</Text>
          <Text style={styles.subLabel}>
            {balances.length === 0
              ? 'No balances'
              : `${balances.length} asset${balances.length === 1 ? '' : 's'} · $${usdCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD cash`}
          </Text>
        </View>
        <View style={styles.totalBlock}>
          <Text style={styles.total}>{formatPrice(total)}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
        </View>
      </Pressable>

      {expanded && balances.length > 0 ? (
        <View style={styles.breakdown}>
          {balances.map((b) => (
            <View key={b.currency} style={styles.balanceRow}>
              <Text style={styles.currency}>{b.currency}</Text>
              <Text style={styles.amount}>{formatAmount(b.amount, b.currency)}</Text>
              <Text style={styles.usdValue}>
                {b.usd_value == null ? '—' : formatPrice(b.usd_value)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function formatAmount(amount: number, currency: string): string {
  if (currency === 'USD' || currency === 'USDC' || currency === 'USDT') {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // For crypto, show up to 6 decimals but trim trailing zeros.
  return amount.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(124, 140, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: { flex: 1, gap: 2 },
  label: { ...type.heading, color: colors.text, fontSize: 14 },
  subLabel: { ...type.micro, color: colors.textMuted },
  totalBlock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  total: {
    ...type.heading,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
    fontSize: 15,
  },
  breakdown: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  currency: { ...type.caption, color: colors.text, fontWeight: '600', width: 64 },
  amount: {
    ...type.caption,
    color: colors.textMuted,
    flex: 1,
    fontVariant: ['tabular-nums' as const],
  },
  usdValue: {
    ...type.caption,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
  },
});
