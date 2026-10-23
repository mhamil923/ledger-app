import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet } from '../lib/api';
import { formatPrice, formatRelativeTime } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

const CHAIN_COLOR: Record<string, string> = {
  ethereum: '#7c8cff',
  polygon: '#a855f7',
  arbitrum: '#06b6d4',
  base: '#3b82f6',
  bitcoin: '#f59e0b',
  solana: '#22c55e',
};

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function formatQuantity(n: number, symbol: string): string {
  if (n === 0) return `0 ${symbol}`;
  const max = Math.abs(n) >= 1 ? 6 : 8;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: max })} ${symbol}`;
}

interface Props {
  wallet: Wallet;
  onSync: (wallet: Wallet) => Promise<void>;
  onDelete: (wallet: Wallet) => void;
  syncing: boolean;
}

export function WalletCard({ wallet, onSync, onDelete, syncing }: Props) {
  const [expanded, setExpanded] = useState(false);
  const chainColor = CHAIN_COLOR[wallet.chain] ?? colors.accent;
  const lastSync = wallet.last_synced_at ? new Date(wallet.last_synced_at).getTime() : null;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <View style={[styles.chainStripe, { backgroundColor: chainColor }]} />
        <View style={styles.headerBody}>
          <View style={styles.headerTop}>
            <View style={styles.labelBlock}>
              <Text style={styles.label}>{wallet.label}</Text>
              <View style={styles.chainRow}>
                <View style={[styles.chainDot, { backgroundColor: chainColor }]} />
                <Text style={styles.chainText}>{wallet.chain_label}</Text>
                <Text style={styles.addressText}>· {truncateAddress(wallet.address)}</Text>
              </View>
            </View>
            <Text style={styles.value}>{formatPrice(wallet.total_usd_value)}</Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.lastSync}>
              {lastSync ? `Synced ${formatRelativeTime(lastSync)}` : 'Not yet synced'}
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={() => void onSync(wallet)}
                disabled={syncing}
                hitSlop={6}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons name="refresh" size={16} color={colors.accent} />
                )}
              </Pressable>
              <Pressable
                onPress={() => onDelete(wallet)}
                hitSlop={6}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              >
                <Ionicons name="trash-outline" size={16} color={colors.textDim} />
              </Pressable>
              <View style={styles.iconBtn}>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textMuted}
                />
              </View>
            </View>
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.expanded}>
          {wallet.balances.length === 0 ? (
            <Text style={styles.emptyBalances}>No balances yet — try syncing.</Text>
          ) : (
            wallet.balances.map((b, i) => (
              <View
                key={`${b.symbol}-${i}`}
                style={[styles.balanceRow, i === wallet.balances.length - 1 && styles.balanceRowLast]}
              >
                <View>
                  <Text style={styles.balanceSymbol}>{b.symbol}</Text>
                  <Text style={styles.balanceQty}>{formatQuantity(b.quantity, b.symbol)}</Text>
                </View>
                <View style={styles.balanceRight}>
                  {b.usd_value != null ? (
                    <>
                      <Text style={styles.balanceValue}>{formatPrice(b.usd_value)}</Text>
                      {b.price != null ? (
                        <Text style={styles.balancePrice}>@ {formatPrice(b.price, 'crypto')}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.balanceError}>No price</Text>
                  )}
                </View>
              </View>
            ))
          )}
          <Text style={styles.fullAddress} selectable>
            {wallet.address}
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
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row' },
  headerPressed: { backgroundColor: colors.bgElevated },
  chainStripe: { width: 3 },
  headerBody: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  labelBlock: { flex: 1, gap: 4 },
  label: { ...type.heading, color: colors.text },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chainDot: { width: 6, height: 6, borderRadius: 3 },
  chainText: { ...type.caption, color: colors.textMuted },
  addressText: { ...type.micro, color: colors.textDim, fontFamily: 'monospace', letterSpacing: 0 },
  value: { ...type.heading, color: colors.text, fontVariant: ['tabular-nums' as const] },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastSync: { ...type.micro, color: colors.textDim },
  actions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: { backgroundColor: colors.bgElevated },
  expanded: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 0,
  },
  emptyBalances: { ...type.caption, color: colors.textMuted, padding: spacing.md, textAlign: 'center' },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  balanceRowLast: { borderBottomWidth: 0 },
  balanceSymbol: { ...type.caption, color: colors.text, fontWeight: '600' },
  balanceQty: { ...type.micro, color: colors.textMuted, fontVariant: ['tabular-nums' as const] },
  balanceRight: { alignItems: 'flex-end' },
  balanceValue: { ...type.caption, color: colors.text, fontVariant: ['tabular-nums' as const] },
  balancePrice: { ...type.micro, color: colors.textDim, fontVariant: ['tabular-nums' as const] },
  balanceError: { ...type.micro, color: colors.warning },
  fullAddress: {
    ...type.micro,
    color: colors.textDim,
    fontFamily: 'monospace',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
