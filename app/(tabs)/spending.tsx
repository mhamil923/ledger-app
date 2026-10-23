import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TransactionRow } from '../../components/TransactionRow';
import { CategorizeSheet } from '../../components/CategorizeSheet';
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
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    filter?: string;
    category_id?: string;
    category_name?: string;
    month?: string;
  }>();
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [onlyUncategorized, setOnlyUncategorized] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<{ id: string; name: string } | null>(null);
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<BankTransaction | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Deep links from the Budget tab ("see transactions", "categorize").
  useEffect(() => {
    if (params.filter === 'uncategorized') setOnlyUncategorized(true);
    if (params.category_id) {
      setCategoryFilter({ id: params.category_id, name: params.category_name ?? 'Category' });
      setOnlyUncategorized(false);
    }
    if (params.month) setMonthFilter(params.month);
  }, [params.filter, params.category_id, params.category_name, params.month]);

  // Banking returns 503 if BANKING_ENC_KEY is unconfigured. We don't retry on
  // that — it's a permanent server-side gate, not a transient error.
  const accountsQuery = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: apiClient.getBankAccounts,
    retry: (n, err) => !(err instanceof ApiError && err.status === 503) && n < 2,
  });

  const txnsQuery = useQuery({
    queryKey: ['transactions', windowDays, accountFilter, onlyUncategorized, categoryFilter?.id, monthFilter],
    queryFn: () =>
      apiClient.getTransactions({
        days: monthFilter ? undefined : windowDays,
        month: monthFilter ?? undefined,
        account_id: accountFilter ?? undefined,
        category_id: categoryFilter?.id,
        uncategorized: onlyUncategorized,
        limit: 1000,
      }),
    retry: (n, err) => !(err instanceof ApiError && err.status === 503) && n < 2,
  });

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: apiClient.getCategories });

  const refetchAccounts = accountsQuery.refetch;
  const refetchTxns = txnsQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchAccounts();
      void refetchTxns();
    }, [refetchAccounts, refetchTxns]),
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

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

  // Transfers (card payoffs, moves between your accounts) are excluded from
  // BOTH spending and income, matching the Budget tab. Off-budget accounts
  // (brokerage) are left out too.
  const stats = useMemo(() => {
    let spent = 0;
    let income = 0;
    let transfersExcluded = 0;
    for (const t of txns) {
      if (t.on_budget === false) continue;
      if (t.is_transfer) {
        if (t.amount < 0) transfersExcluded += -t.amount;
        continue;
      }
      if (t.amount < 0) spent += -t.amount;
      else income += t.amount;
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
  const periodLabel = monthFilter ? monthName(monthFilter) : `last ${windowDays}d`;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        eyebrow="LAYER 4"
        title="Spending"
        subtitle={
          bankingDisabled
            ? 'Banking not configured'
            : txns.length > 0
              ? `${txns.length} txn${txns.length === 1 ? '' : 's'} · ${periodLabel}`
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
              <StatsBlock stats={stats} label={periodLabel.toUpperCase()} />
              {monthFilter ? null : <WindowChips value={windowDays} onChange={setWindowDays} />}
              <View style={styles.filterRow}>
                <FilterChip
                  label="Uncategorized"
                  icon="help-circle-outline"
                  active={onlyUncategorized}
                  onPress={() => {
                    setOnlyUncategorized(!onlyUncategorized);
                    setCategoryFilter(null);
                  }}
                />
                {categoryFilter ? (
                  <FilterChip label={categoryFilter.name} icon="close" active onPress={() => setCategoryFilter(null)} />
                ) : null}
                {monthFilter ? (
                  <FilterChip label={monthName(monthFilter)} icon="close" active onPress={() => setMonthFilter(null)} />
                ) : null}
              </View>
              <AccountChips
                accounts={accounts}
                value={accountFilter}
                onChange={setAccountFilter}
              />
              {toast ? (
                <View style={styles.toast}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.positive} />
                  <Text style={styles.toastText}>{toast}</Text>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={onlyUncategorized ? 'checkmark-done-outline' : 'receipt-outline'} size={28} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {onlyUncategorized ? 'Everything is categorized' : 'No transactions in this window'}
              </Text>
              <Text style={styles.emptyDesc}>
                {onlyUncategorized
                  ? 'Nice. New transactions are filed by your rules (and Claude) on every sync.'
                  : 'Try widening the date range, removing a filter, or syncing your bank from the Accounts tab.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TransactionRow txn={item} account={accountById.get(item.account_id)} onPress={() => setSelected(item)} />
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

      <CategorizeSheet
        txn={selected}
        categories={categoriesQuery.data?.categories ?? []}
        onClose={() => setSelected(null)}
        onSaved={(message) => {
          if (message) setToast(message);
          void queryClient.invalidateQueries({ queryKey: ['transactions'] });
          void queryClient.invalidateQueries({ queryKey: ['budget'] });
          void queryClient.invalidateQueries({ queryKey: ['overview'] });
        }}
      />
    </SafeAreaView>
  );
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function FilterChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.acctChip, active && styles.acctChipActive, styles.filterChip]}>
      <Ionicons name={icon} size={12} color={active ? colors.bg : colors.textMuted} />
      <Text style={[styles.acctChipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StatsBlock({
  stats,
  label,
}: {
  stats: {
    spent: number;
    income: number;
    net: number;
    count: number;
    transfers_excluded: number;
  };
  label: string;
}) {
  return (
    <View style={styles.statsCard}>
      <Text style={styles.statsLabel}>{label}</Text>
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
  filterRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  toastText: { ...type.micro, color: colors.text, flex: 1 },
});
