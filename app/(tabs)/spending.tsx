import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TransactionRow } from '../../components/TransactionRow';
import {
  apiClient,
  ApiError,
  type BankAccount,
  type BankTransaction,
} from '../../lib/api';
import { formatPrice } from '../../lib/format';
import { colors, radius, spacing, type } from '../../theme/colors';

type WindowDays = 30 | 60 | 90;

const WINDOW_OPTIONS: { value: WindowDays; label: string }[] = [
  { value: 30, label: '30D' },
  { value: 60, label: '60D' },
  { value: 90, label: '90D' },
];

export default function SpendingScreen() {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);

  // Banking returns 503 if BANKING_ENC_KEY is unconfigured. We don't retry on
  // that — it's a permanent server-side gate, not a transient error.
  const accountsQuery = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: apiClient.getBankAccounts,
    retry: (n, err) => !(err instanceof ApiError && err.status === 503) && n < 2,
  });

  const txnsQuery = useQuery({
    queryKey: ['bank-transactions', windowDays, accountFilter],
    queryFn: () =>
      apiClient.getBankTransactions({
        days: windowDays,
        account_id: accountFilter ?? undefined,
        limit: 500,
      }),
    retry: (n, err) => !(err instanceof ApiError && err.status === 503) && n < 2,
  });

  const refetchAccounts = accountsQuery.refetch;
  const refetchTxns = txnsQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchAccounts();
      void refetchTxns();
    }, [refetchAccounts, refetchTxns]),
  );

  const bankingDisabled =
    (accountsQuery.isError && accountsQuery.error instanceof ApiError && accountsQuery.error.status === 503) ||
    (txnsQuery.isError && txnsQuery.error instanceof ApiError && txnsQuery.error.status === 503);

  const accounts = accountsQuery.data?.accounts ?? [];
  const accountById = useMemo(() => {
    const map = new Map<string, BankAccount>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);
  const txns = txnsQuery.data?.transactions ?? [];

  // Spent = sum of negative amounts. Income = sum of positive amounts. We work
  // Exclude transfers (credit-card payments, internal xfers) from spending
  // stats so the number matches the Budget page. Users still see those rows
  // in the list — just tagged as TRANSFER — but they don't inflate the total.
  const stats = useMemo(() => {
    let spent = 0;
    let income = 0;
    let transfersExcluded = 0;
    for (const t of txns) {
      if (t.amount < 0) {
        if (t.is_transfer) {
          transfersExcluded += -t.amount;
        } else {
          spent += -t.amount;
        }
      } else income += t.amount;
    }
    return {
      spent,
      income,
      net: income - spent,
      count: txns.length,
      transfers_excluded: transfersExcluded,
    };
  }, [txns]);

  const initialLoading = txnsQuery.isLoading || accountsQuery.isLoading;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        eyebrow="LAYER 4"
        title="Spending"
        subtitle={
          bankingDisabled
            ? 'Banking not configured'
            : txns.length > 0
              ? `${txns.length} txn${txns.length === 1 ? '' : 's'} · last ${windowDays}d`
              : 'Connected accounts'
        }
      />

      {bankingDisabled ? (
        <DisabledState />
      ) : initialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : txnsQuery.isError ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Couldn't load transactions</Text>
          <Text style={styles.emptyDesc}>
            {txnsQuery.error instanceof Error ? txnsQuery.error.message : 'Unknown error'}
          </Text>
          <Pressable onPress={() => void txnsQuery.refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : accounts.length === 0 ? (
        <EmptyAccounts />
      ) : (
        <FlatList
          data={txns}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            <View style={styles.headerStack}>
              <StatsBlock stats={stats} windowDays={windowDays} />
              <WindowChips value={windowDays} onChange={setWindowDays} />
              <AccountChips
                accounts={accounts}
                value={accountFilter}
                onChange={setAccountFilter}
              />
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No transactions in this window</Text>
              <Text style={styles.emptyDesc}>
                Try widening the date range, removing the account filter, or syncing your bank
                from the Accounts tab.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TransactionRow txn={item} account={accountById.get(item.account_id)} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={txnsQuery.isFetching && !txnsQuery.isLoading}
              onRefresh={() => void txnsQuery.refetch()}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function StatsBlock({
  stats,
  windowDays,
}: {
  stats: {
    spent: number;
    income: number;
    net: number;
    count: number;
    transfers_excluded: number;
  };
  windowDays: WindowDays;
}) {
  return (
    <View style={styles.statsCard}>
      <Text style={styles.statsLabel}>LAST {windowDays} DAYS</Text>
      <Text style={styles.statsSpent}>−{formatPrice(stats.spent)}</Text>
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statCellLabel}>Income</Text>
          <Text style={[styles.statCellValue, { color: colors.positive }]}>
            +{formatPrice(stats.income)}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statCellLabel}>Net</Text>
          <Text
            style={[
              styles.statCellValue,
              { color: stats.net >= 0 ? colors.positive : colors.negative },
            ]}
          >
            {stats.net >= 0 ? '+' : '−'}
            {formatPrice(Math.abs(stats.net))}
          </Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statCellLabel}>Count</Text>
          <Text style={styles.statCellValue}>{stats.count}</Text>
        </View>
      </View>
      {stats.transfers_excluded > 0 ? (
        <Text style={styles.transferNote}>
          Excluded {formatPrice(stats.transfers_excluded)} of credit-card payments and
          internal transfers — those aren't real spending.
        </Text>
      ) : null}
    </View>
  );
}

function WindowChips({
  value,
  onChange,
}: {
  value: WindowDays;
  onChange: (next: WindowDays) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {WINDOW_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && !active && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AccountChips({
  accounts,
  value,
  onChange,
}: {
  accounts: BankAccount[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  if (accounts.length <= 1) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.acctRow}>
      <Pressable
        onPress={() => onChange(null)}
        style={({ pressed }) => [
          styles.acctChip,
          value == null && styles.acctChipActive,
          pressed && value != null && styles.chipPressed,
        ]}
      >
        <Text style={[styles.acctChipText, value == null && styles.chipTextActive]}>All</Text>
      </Pressable>
      {accounts.map((a) => {
        const active = value === a.id;
        const label = a.mask ? `${shortInstitution(a)} ··${a.mask}` : shortInstitution(a);
        return (
          <Pressable
            key={a.id}
            onPress={() => onChange(a.id)}
            style={({ pressed }) => [
              styles.acctChip,
              active && styles.acctChipActive,
              pressed && !active && styles.chipPressed,
            ]}
          >
            <Text style={[styles.acctChipText, active && styles.chipTextActive]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function shortInstitution(a: BankAccount): string {
  const src = a.institution ?? a.name;
  // Strip parenthesized suffixes like " (5219)" so chips stay short.
  return src.replace(/\s*\([^)]+\)\s*$/, '');
}

function DisabledState() {
  return (
    <View style={styles.empty}>
      <Ionicons name="lock-closed-outline" size={32} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>Banking is disabled</Text>
      <Text style={styles.emptyDesc}>
        Add a BANKING_ENC_KEY to the backend .env to enable encrypted bank-account storage, then
        connect a bank from the Accounts tab.
      </Text>
    </View>
  );
}

function EmptyAccounts() {
  return (
    <View style={styles.empty}>
      <Ionicons name="business-outline" size={32} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No bank accounts connected</Text>
      <Text style={styles.emptyDesc}>
        Connect via SimpleFIN on the Accounts tab. Transactions for the last 90 days import on the
        initial sync.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { ...type.title, color: colors.text, textAlign: 'center' },
  emptyDesc: {
    ...type.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 380,
    lineHeight: 22,
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
  },
  retryBtnText: { ...type.heading, color: colors.bg, fontSize: 14 },

  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  sep: { height: spacing.sm },

  headerStack: { gap: spacing.md, marginBottom: spacing.md },
  statsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statsLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  statsSpent: {
    ...type.display,
    color: colors.text,
    fontSize: 32,
    fontVariant: ['tabular-nums' as const],
  },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  statCell: { flex: 1, gap: 2 },
  statCellLabel: { ...type.micro, color: colors.textDim, letterSpacing: 0.5 },
  statCellValue: {
    ...type.heading,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
    fontSize: 14,
  },
  transferNote: {
    ...type.micro,
    color: colors.textDim,
    marginTop: spacing.sm,
    fontStyle: 'italic',
    fontSize: 10,
  },

  chipRow: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 4,
  },
  chip: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  chipActive: { backgroundColor: colors.accent },
  chipPressed: { backgroundColor: colors.bgElevated },
  chipText: {
    ...type.micro,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chipTextActive: { color: colors.bg },

  acctRow: { gap: 6, paddingVertical: 2 },
  acctChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    maxWidth: 220,
  },
  acctChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  acctChipText: { ...type.micro, color: colors.textMuted, fontWeight: '600' },
});
