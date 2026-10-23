import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { WalletCard } from '../../components/WalletCard';
import { AddWalletModal } from '../../components/AddWalletModal';
import { BankAccountCard } from '../../components/BankAccountCard';
import { ConnectBankModal } from '../../components/ConnectBankModal';
import { ExchangeAccountCard } from '../../components/ExchangeAccountCard';
import { AppleCardImportSheet } from '../../components/AppleCardImportSheet';
import {
  apiClient,
  ApiError,
  type BankAccount,
  type ExchangeAccount,
  type Wallet,
} from '../../lib/api';
import { formatPrice } from '../../lib/format';
import { colors, radius, spacing, type } from '../../theme/colors';

export default function AccountsScreen() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [connectBankOpen, setConnectBankOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [bankSyncing, setBankSyncing] = useState(false);

  const walletsQuery = useQuery({
    queryKey: ['wallets'],
    queryFn: apiClient.getWallets,
    refetchInterval: 120_000,
  });

  // Banking is gated server-side on BANKING_ENC_KEY. If unconfigured the
  // endpoint returns 503; we treat that as "feature disabled" rather than a
  // hard error, so the rest of the page stays usable.
  const bankingQuery = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: apiClient.getBankAccounts,
    refetchInterval: 300_000,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 503) return false;
      return failureCount < 2;
    },
  });

  const exchangesQuery = useQuery({
    queryKey: ['exchange-accounts'],
    queryFn: apiClient.getExchangeAccounts,
    refetchInterval: 120_000,
  });
  const bankingDisabled =
    bankingQuery.isError &&
    bankingQuery.error instanceof ApiError &&
    bankingQuery.error.status === 503;

  // react-query's `refetch` is a stable reference, so depending on the
  // functions (not the full query object) avoids re-firing the focus effect
  // every time the query's loading/error state changes — which would
  // otherwise loop until the network errors out.
  const refetchWallets = walletsQuery.refetch;
  const refetchBanking = bankingQuery.refetch;
  const refetchExchanges = exchangesQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchWallets();
      void refetchBanking();
      void refetchExchanges();
    }, [refetchWallets, refetchBanking, refetchExchanges]),
  );

  const addMutation = useMutation({
    mutationFn: apiClient.addWallet,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wallets'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: apiClient.deleteWallet,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wallets'] }),
  });

  const handleSync = async (wallet: Wallet): Promise<void> => {
    setSyncingId(wallet.id);
    try {
      await apiClient.syncWallet(wallet.id);
      await queryClient.invalidateQueries({ queryKey: ['wallets'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(message);
      } else {
        Alert.alert('Sync failed', message);
      }
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = (wallet: Wallet): void => {
    const message = `Remove "${wallet.label}" from your wallets?`;
    const proceed = (): void => {
      deleteMutation.mutate(wallet.id);
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) proceed();
      return;
    }
    Alert.alert('Remove wallet?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: proceed },
    ]);
  };

  const wallets = walletsQuery.data?.wallets ?? [];
  const total = walletsQuery.data?.total_usd_value ?? 0;
  const bankAccounts: BankAccount[] = bankingQuery.data?.accounts ?? [];
  const bankConnection = bankingQuery.data?.connection ?? null;

  // Coinbase summary — only render if it's configured and has data. Other
  // exchanges (Alpaca paper/live) are excluded from the Accounts page since
  // those are trading-only and surface in the execute modal instead.
  const exchangeAccounts: ExchangeAccount[] = exchangesQuery.data?.accounts ?? [];
  const coinbase = exchangeAccounts.find(
    (a): a is Extract<ExchangeAccount, { provider: 'coinbase' }> =>
      a.provider === 'coinbase' && a.configured,
  );

  // Bank net worth: assets minus debts (credit cards / loans).
  const bankNet = bankAccounts.reduce((sum, a) => {
    if (a.current_balance == null || a.on_budget === false) return sum;
    const isDebt = a.account_type === 'credit_card' || a.account_type === 'loan';
    return sum + (isDebt ? -Math.abs(a.current_balance) : a.current_balance);
  }, 0);

  const handleConnectBank = async (setupToken: string): Promise<void> => {
    await apiClient.connectBank(setupToken);
    await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
  };

  const handleBankSync = async (): Promise<void> => {
    setBankSyncing(true);
    try {
      await apiClient.syncBank();
      await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(message);
      } else {
        Alert.alert('Sync failed', message);
      }
    } finally {
      setBankSyncing(false);
    }
  };

  const handleDisconnectBank = (): void => {
    const message = 'Remove the SimpleFIN connection and all synced bank data?';
    const proceed = async (): Promise<void> => {
      await apiClient.disconnectBank();
      await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) void proceed();
      return;
    }
    Alert.alert('Disconnect bank?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => void proceed() },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        eyebrow="LAYER 3"
        title="Accounts"
        subtitle={
          wallets.length > 0
            ? `${wallets.length} wallet${wallets.length === 1 ? '' : 's'}`
            : 'Read-only crypto wallets'
        }
        rightIcon="add"
        onRightPress={() => setAddOpen(true)}
      />

      {walletsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : walletsQuery.isError ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Couldn't load wallets</Text>
          <Text style={styles.emptyDesc}>
            {walletsQuery.error instanceof Error ? walletsQuery.error.message : 'Unknown error'}
          </Text>
          <Pressable onPress={() => void walletsQuery.refetch()} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : wallets.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyScroll}>
          <BankSection
            disabled={bankingDisabled}
            accounts={bankAccounts}
            connection={bankConnection}
            netWorth={bankNet}
            syncing={bankSyncing}
            onConnect={() => setConnectBankOpen(true)}
            onSync={() => void handleBankSync()}
            onDisconnect={handleDisconnectBank}
          />
          {coinbase ? <ExchangeAccountCard account={coinbase} /> : null}
          <EmptyState onAdd={() => setAddOpen(true)} />
        </ScrollView>
      ) : (
        <FlatList
          data={wallets}
          keyExtractor={(w) => w.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>CRYPTO HOLDINGS</Text>
              <Text style={styles.summaryValue}>{formatPrice(total)}</Text>
              <Text style={styles.summaryHint}>
                Native-asset balances across {wallets.length} watch-only wallet
                {wallets.length === 1 ? '' : 's'}.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <WalletCard
              wallet={item}
              onSync={handleSync}
              onDelete={handleDelete}
              syncing={syncingId === item.id}
            />
          )}
          ListFooterComponent={
            <View style={styles.footerBlocks}>
              <BankSection
                disabled={bankingDisabled}
                accounts={bankAccounts}
                connection={bankConnection}
                netWorth={bankNet}
                syncing={bankSyncing}
                onConnect={() => setConnectBankOpen(true)}
                onSync={() => void handleBankSync()}
                onDisconnect={handleDisconnectBank}
              />
              {coinbase ? <ExchangeAccountCard account={coinbase} /> : null}
              <FutureBlock
                icon="trending-up-outline"
                title="Brokerage accounts"
                description="Read positions from Plaid Investments or Schwab API."
              />
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={walletsQuery.isFetching && !walletsQuery.isLoading}
              onRefresh={() => void walletsQuery.refetch()}
              tintColor={colors.accent}
            />
          }
        />
      )}

      <AddWalletModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          await addMutation.mutateAsync(input);
        }}
      />

      <ConnectBankModal
        visible={connectBankOpen}
        onClose={() => setConnectBankOpen(false)}
        onSubmit={handleConnectBank}
      />
    </SafeAreaView>
  );
}

function BankSection({
  disabled,
  accounts,
  connection,
  netWorth,
  syncing,
  onConnect,
  onSync,
  onDisconnect,
}: {
  disabled: boolean;
  accounts: BankAccount[];
  connection: { status: string; last_synced_at: string | null; last_error: string | null } | null;
  netWorth: number;
  syncing: boolean;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  if (disabled) {
    return (
      <View style={styles.futureBlock}>
        <View style={styles.futureIcon}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textDim} />
        </View>
        <View style={styles.futureBody}>
          <View style={styles.futureTitleRow}>
            <Text style={styles.futureTitle}>Bank accounts</Text>
            <View style={styles.futureBadge}>
              <Text style={styles.futureBadgeText}>SETUP</Text>
            </View>
          </View>
          <Text style={styles.futureDesc}>
            Add a BANKING_ENC_KEY to the backend .env to enable encrypted bank-account storage.
          </Text>
        </View>
      </View>
    );
  }

  if (accounts.length === 0) {
    return (
      <View style={styles.bankEmpty}>
        <View style={styles.bankEmptyIcon}>
          <Ionicons name="business-outline" size={22} color={colors.accent} />
        </View>
        <Text style={styles.bankEmptyTitle}>Connect a bank</Text>
        <Text style={styles.bankEmptyDesc}>
          Add bank accounts, credit cards, and transactions via SimpleFIN. Read-only, encrypted at
          rest.
        </Text>
        <Pressable
          onPress={onConnect}
          style={({ pressed }) => [styles.bankConnectBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="link" size={14} color={colors.bg} />
          <Text style={styles.bankConnectBtnText}>Connect via SimpleFIN</Text>
        </Pressable>
      </View>
    );
  }

  // Breakdown so the headline is obvious: cash in the bank minus what's owed
  // on cards. Coinbase / investments are deliberately NOT included here.
  let cashTotal = 0;
  let owedTotal = 0;
  for (const a of accounts) {
    if (a.current_balance == null || a.on_budget === false) continue;
    const isDebt = a.account_type === 'credit_card' || a.account_type === 'loan';
    if (isDebt) owedTotal += Math.abs(a.current_balance);
    else cashTotal += a.current_balance;
  }
  // SimpleFIN refreshes from the banks about once a day; show how old the
  // bank's numbers actually are, not just when we asked.
  const asOfTimes = accounts
    .filter((a) => a.provider !== 'apple_card' && a.balance_as_of)
    .map((a) => new Date(a.balance_as_of!).getTime());
  const oldestAsOf = asOfTimes.length ? new Date(Math.min(...asOfTimes)) : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.bankSummary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>CASH MINUS CARDS</Text>
          <Text style={styles.summaryValue}>{formatPrice(netWorth)}</Text>
          <Text style={styles.summaryHint}>
            {formatPrice(cashTotal)} cash − {formatPrice(owedTotal)} owed on cards
          </Text>
          <Text style={styles.summaryHint}>
            {oldestAsOf ? `Bank data as of ${formatAsOf(oldestAsOf)}` : `${accounts.length} accounts`}
            {connection?.last_synced_at ? ` · synced ${syncedAgo(connection.last_synced_at)}` : ''}
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Pressable
            onPress={onSync}
            disabled={syncing}
            style={({ pressed }) => [styles.smallBtn, (pressed || syncing) && { opacity: 0.6 }]}
          >
            {syncing ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Ionicons name="refresh" size={14} color={colors.accent} />
            )}
            <Text style={styles.smallBtnText}>Sync</Text>
          </Pressable>
          <Pressable
            onPress={onDisconnect}
            style={({ pressed }) => [styles.smallBtnDanger, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close-circle-outline" size={14} color={colors.negative} />
            <Text style={styles.smallBtnDangerText}>Remove</Text>
          </Pressable>
        </View>
      </View>
      {connection?.status === 'error' && connection.last_error ? (
        <View style={styles.errorStrip}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.errorStripText}>{connection.last_error}</Text>
        </View>
      ) : null}
      {accounts.map((a) => (
        <BankAccountCard key={a.id} account={a} />
      ))}
      <AppleCardImportButton hasAppleCard={accounts.some((a) => a.provider === 'apple_card')} />
    </View>
  );
}

function AppleCardImportButton({ hasAppleCard }: { hasAppleCard: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.appleImportBtn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="logo-apple" size={16} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={styles.appleImportTitle}>{hasAppleCard ? 'Update Apple Card' : 'Add Apple Card'}</Text>
          <Text style={styles.appleImportDesc}>
            {hasAppleCard
              ? 'Import a fresh export from Wallet to bring it up to date'
              : "Apple Card can't link through SimpleFIN. Import its export instead."}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
      <AppleCardImportSheet
        visible={open}
        onClose={() => setOpen(false)}
        onImported={() => {
          for (const k of ['bank-accounts', 'transactions', 'budget', 'overview', 'bills']) {
            void queryClient.invalidateQueries({ queryKey: [k] });
          }
        }}
      />
    </>
  );
}

function formatAsOf(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function syncedAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="wallet-outline" size={28} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>No wallets yet</Text>
      <Text style={styles.emptyDesc}>
        Add a public wallet address to track your crypto balance across chains. Read-only — we never
        ask for keys.
      </Text>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={18} color={colors.bg} />
        <Text style={styles.emptyButtonText}>Add a wallet</Text>
      </Pressable>
      <Text style={styles.emptyHint}>
        Supported: Ethereum · Polygon · Arbitrum · Base · Bitcoin · Solana
      </Text>
    </View>
  );
}

function FutureBlock({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.futureBlock}>
      <View style={styles.futureIcon}>
        <Ionicons name={icon} size={18} color={colors.textDim} />
      </View>
      <View style={styles.futureBody}>
        <View style={styles.futureTitleRow}>
          <Text style={styles.futureTitle}>{title}</Text>
          <View style={styles.futureBadge}>
            <Text style={styles.futureBadgeText}>SOON</Text>
          </View>
        </View>
        <Text style={styles.futureDesc}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  separator: { height: spacing.sm },
  summary: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  summaryLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  summaryValue: {
    ...type.display,
    color: colors.text,
    fontSize: 32,
    fontVariant: ['tabular-nums' as const],
  },
  summaryHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(124, 140, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { ...type.title, color: colors.text },
  emptyDesc: {
    ...type.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 22,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  emptyButtonText: { ...type.heading, color: colors.bg },
  emptyHint: { ...type.micro, color: colors.textDim, marginTop: spacing.md, textAlign: 'center' },
  footerBlocks: { gap: spacing.sm, marginTop: spacing.xl },
  futureBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
  },
  futureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  futureBody: { flex: 1, gap: 2 },
  futureTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  futureTitle: { ...type.heading, color: colors.textMuted, fontSize: 14 },
  futureBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  futureBadgeText: { fontSize: 9, fontWeight: '700', color: colors.textDim, letterSpacing: 0.5 },
  futureDesc: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  bankSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  bankEmpty: {
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  bankEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(124, 140, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  bankEmptyTitle: { ...type.heading, color: colors.text },
  bankEmptyDesc: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  bankConnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  bankConnectBtnText: { ...type.caption, color: colors.bg, fontWeight: '700' },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    backgroundColor: 'rgba(124, 140, 255, 0.10)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(124, 140, 255, 0.25)',
  },
  smallBtnText: { ...type.micro, color: colors.accent, fontWeight: '700' },
  smallBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  smallBtnDangerText: { ...type.micro, color: colors.negative, fontWeight: '700' },
  errorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 159, 10, 0.08)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.25)',
  },
  errorStripText: { ...type.micro, color: colors.warning, flex: 1, fontSize: 11 },
  emptyScroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  appleImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  appleImportTitle: { ...type.caption, color: colors.text, fontWeight: '600' },
  appleImportDesc: { ...type.micro, color: colors.textDim, marginTop: 2 },
});
