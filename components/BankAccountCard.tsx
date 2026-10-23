import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { Ionicons } from '@expo/vector-icons';
import type { BankAccount } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

const TYPE_LABEL: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit_card: 'Credit Card',
  loan: 'Loan',
  investment: 'Investment',
  depository: 'Account',
};

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  checking: 'wallet-outline',
  savings: 'cash-outline',
  credit_card: 'card-outline',
  loan: 'document-text-outline',
  investment: 'trending-up-outline',
  depository: 'business-outline',
};

interface Props {
  account: BankAccount;
}

export function BankAccountCard({ account }: Props) {
  const queryClient = useQueryClient();
  const [onBudget, setOnBudget] = useState(account.on_budget !== false);
  const [saving, setSaving] = useState(false);
  const toggleBudget = async (): Promise<void> => {
    const next = !onBudget;
    setOnBudget(next);
    setSaving(true);
    try {
      await apiClient.setAccountOnBudget(account.id, next);
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
      void queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    } catch {
      setOnBudget(!next);
    } finally {
      setSaving(false);
    }
  };
  const icon = TYPE_ICON[account.account_type] ?? 'business-outline';
  const typeLabel = TYPE_LABEL[account.account_type] ?? 'Account';
  const balance = account.current_balance;
  // For credit cards, the balance is the AMOUNT OWED — show in negative styling.
  const isDebt = account.account_type === 'credit_card' || account.account_type === 'loan';

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {account.name}
        </Text>
        <View style={styles.metaRow}>
          {account.institution ? (
            <Text style={styles.meta}>{account.institution}</Text>
          ) : null}
          <Text style={styles.metaDim}>{typeLabel}</Text>
          {account.mask ? <Text style={styles.metaDim}>•••• {account.mask}</Text> : null}
          <Pressable
            onPress={() => void toggleBudget()}
            disabled={saving}
            hitSlop={6}
            accessibilityLabel={onBudget ? 'On budget, tap to take off budget' : 'Off budget, tap to put on budget'}
            style={[styles.budgetPill, !onBudget && styles.budgetPillOff]}
          >
            <Text style={[styles.budgetPillText, !onBudget && { color: colors.textDim }]}>
              {onBudget ? 'ON BUDGET' : 'OFF BUDGET'}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.balanceBlock}>
        <Text
          style={[
            styles.balance,
            isDebt && balance != null && balance !== 0 ? styles.balanceDebt : null,
          ]}
        >
          {balance == null ? '—' : formatPrice(balance)}
        </Text>
        {isDebt && balance != null && balance !== 0 ? (
          <Text style={styles.balanceHint}>owed</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(124, 140, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  name: { ...type.heading, color: colors.text, fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  meta: { ...type.micro, color: colors.textMuted },
  metaDim: { ...type.micro, color: colors.textDim },
  balanceBlock: { alignItems: 'flex-end' },
  balance: {
    ...type.heading,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
    fontSize: 15,
  },
  balanceDebt: { color: colors.negative },
  balanceHint: { ...type.micro, color: colors.textDim, fontSize: 9, letterSpacing: 0.5 },
  budgetPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(124, 140, 255, 0.3)',
    backgroundColor: 'rgba(124, 140, 255, 0.10)',
  },
  budgetPillOff: { borderColor: colors.border, backgroundColor: 'transparent' },
  budgetPillText: { ...type.micro, color: colors.accent, fontWeight: '700', fontSize: 9, letterSpacing: 0.5 },
});
