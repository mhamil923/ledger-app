import { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { HoldingRow } from '../../components/HoldingRow';
import { AddHoldingModal } from '../../components/AddHoldingModal';
import {
  apiClient,
  ApiError,
  type BankAccount,
  type ExchangeAccount,
  type HoldingSummary,
  type Wallet,
} from '../../lib/api';
import { formatPrice } from '../../lib/format';
import { colors, radius, spacing, type } from '../../theme/colors';

export default function PortfolioScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: apiClient.getPortfolio,
    refetchInterval: 60_000,
  });
  const walletsQuery = useQuery({
    queryKey: ['wallets'],
    queryFn: apiClient.getWallets,
    refetchInterval: 120_000,
  });
  const exchangesQuery = useQuery({
    queryKey: ['exchange-accounts'],
    queryFn: apiClient.getExchangeAccounts,
    refetchInterval: 120_000,
  });
  // Banking can return 503 if BANKING_ENC_KEY missing — that's fine, we just
  // skip cash/liabilities and the rest of the page still renders.
  const bankingQuery = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: apiClient.getBankAccounts,
    refetchInterval: 300_000,
    retry: (n, err) => !(err instanceof ApiError && err.status === 503) && n < 2,
  });

  const refetchAll = useCallback((): void => {
    void portfolioQuery.refetch();
    void walletsQuery.refetch();
    void exchangesQuery.refetch();
    void bankingQuery.refetch();
  }, [portfolioQuery, walletsQuery, exchangesQuery, bankingQuery]);

  const refetchPortfolio = portfolioQuery.refetch;
  const refetchWallets = walletsQuery.refetch;
  const refetchExchanges = exchangesQuery.refetch;
  const refetchBanking = bankingQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchPortfolio();
      void refetchWallets();
      void refetchExchanges();
      void refetchBanking();
    }, [refetchPortfolio, refetchWallets, refetchExchanges, refetchBanking]),
  );

  const addMutation = useMutation({
    mutationFn: apiClient.addHolding,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
  });

  const aggregated = useMemo(
    () =>
      aggregate({
        holdings: portfolioQuery.data?.holdings ?? [],
        wallets: walletsQuery.data?.wallets ?? [],
        coinbase:
          exchangesQuery.data?.accounts?.find(
            (a): a is Extract<ExchangeAccount, { provider: 'coinbase' }> =>
              a.provider === 'coinbase' && a.configured,
          ) ?? null,
        bankAccounts: bankingQuery.data?.accounts ?? [],
      }),
    [portfolioQuery.data, walletsQuery.data, exchangesQuery.data, bankingQuery.data],
  );

  const onRowPress = (holding: HoldingSummary): void => {
    router.push({ pathname: '/holding/[id]', params: { id: holding.id } });
  };

  const initialLoading =
    portfolioQuery.isLoading ||
    (walletsQuery.isLoading && !walletsQuery.isError) ||
    (exchangesQuery.isLoading && !exchangesQuery.isError);

  const anyData =
    aggregated.stocks.length > 0 ||
    aggregated.cryptoLines.length > 0 ||
    aggregated.cashLines.length > 0 ||
    aggregated.liabilityLines.length > 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        eyebrow="LAYER 2"
        title="Portfolio"
        subtitle={
          anyData ? `Net worth · ${formatPrice(aggregated.netWorth)}` : 'Track what you own'
        }
        rightIcon="add"
        onRightPress={() => setAddOpen(true)}
      />

      {initialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !anyData ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={portfolioQuery.isFetching && !portfolioQuery.isLoading}
              onRefresh={refetchAll}
              tintColor={colors.accent}
            />
          }
        >
          <NetWorthCard agg={aggregated} />
          <AllocationStrip agg={aggregated} />

          {aggregated.stocks.length > 0 ? (
            <Section
              icon="trending-up-outline"
              title="STOCKS & ETFS"
              value={aggregated.stocksTotal}
            >
              {aggregated.stocks.map((h, i) => (
                <HoldingRow
                  key={h.id}
                  holding={h}
                  accentColor={SECTION_COLORS.stocks[i % SECTION_COLORS.stocks.length]!}
                  onPress={onRowPress}
                />
              ))}
            </Section>
          ) : null}

          {aggregated.cryptoLines.length > 0 ? (
            <Section
              icon="logo-bitcoin"
              title="CRYPTO"
              value={aggregated.cryptoTotal}
            >
              {aggregated.cryptoLines.map((line) => (
                <AssetLine key={line.key} line={line} />
              ))}
            </Section>
          ) : null}

          {aggregated.cashLines.length > 0 ? (
            <Section
              icon="cash-outline"
              title="CASH"
              value={aggregated.cashTotal}
            >
              {aggregated.cashLines.map((line) => (
                <AssetLine key={line.key} line={line} />
              ))}
            </Section>
          ) : null}

          {aggregated.liabilityLines.length > 0 ? (
            <Section
              icon="card-outline"
              title="LIABILITIES"
              value={-aggregated.liabilitiesTotal}
              negative
            >
              {aggregated.liabilityLines.map((line) => (
                <AssetLine key={line.key} line={line} negative />
              ))}
            </Section>
          ) : null}

          <Text style={styles.footer}>
            Tap a stock or ETF to see lots and P&L. Crypto and bank balances pull from your
            connected accounts.
          </Text>
        </ScrollView>
      )}

      <AddHoldingModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          await addMutation.mutateAsync(input);
        }}
      />
    </SafeAreaView>
  );
}

// ----- Data aggregation -----

interface AssetLineData {
  key: string;
  label: string;
  sub: string | null;
  value: number;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
}

interface Aggregated {
  netWorth: number;
  stocks: HoldingSummary[];
  stocksTotal: number;
  cryptoLines: AssetLineData[];
  cryptoTotal: number;
  cashLines: AssetLineData[];
  cashTotal: number;
  liabilityLines: AssetLineData[];
  liabilitiesTotal: number;
}

function aggregate(input: {
  holdings: HoldingSummary[];
  wallets: Wallet[];
  coinbase: Extract<ExchangeAccount, { provider: 'coinbase' }> | null;
  bankAccounts: BankAccount[];
}): Aggregated {
  // Stocks & ETFs come from manual holdings, excluding crypto.
  const stocks = input.holdings.filter((h) => h.asset_type !== 'crypto');
  const stocksTotal = stocks.reduce((s, h) => s + (h.market_value ?? 0), 0);

  // Crypto: each wallet as one line, plus Coinbase as one line (collapsed —
  // detailed breakdown lives on the Accounts tab).
  const cryptoLines: AssetLineData[] = [];
  for (const w of input.wallets) {
    cryptoLines.push({
      key: `wallet-${w.id}`,
      label: w.label,
      sub: w.chain_label,
      value: w.total_usd_value ?? 0,
    });
  }
  // Manual crypto holdings (anything the user typed in by hand) also belong
  // in this section.
  for (const h of input.holdings) {
    if (h.asset_type === 'crypto') {
      cryptoLines.push({
        key: `manual-${h.id}`,
        label: h.symbol,
        sub: 'Manual',
        value: h.market_value ?? 0,
      });
    }
  }
  // Coinbase: subtract USD cash from total so it doesn't double-count cash.
  if (input.coinbase) {
    const total = input.coinbase.total_usd_value ?? 0;
    const usdCash = input.coinbase.usd_balance ?? 0;
    const cryptoOnly = total - usdCash;
    if (cryptoOnly > 0.01) {
      cryptoLines.push({
        key: 'coinbase-crypto',
        label: 'Coinbase',
        sub: `${(input.coinbase.balances ?? []).filter((b) => b.currency !== 'USD').length} assets`,
        value: cryptoOnly,
      });
    }
  }
  cryptoLines.sort((a, b) => b.value - a.value);
  const cryptoTotal = cryptoLines.reduce((s, l) => s + l.value, 0);

  // Cash: checking + savings + Coinbase USD.
  const cashLines: AssetLineData[] = [];
  for (const a of input.bankAccounts) {
    if (a.account_type === 'checking' || a.account_type === 'savings' || a.account_type === 'depository') {
      const balance = a.current_balance ?? 0;
      if (balance > 0) {
        cashLines.push({
          key: `bank-${a.id}`,
          label: a.name,
          sub: a.institution ?? null,
          value: balance,
        });
      }
    }
  }
  if (input.coinbase && (input.coinbase.usd_balance ?? 0) > 0) {
    cashLines.push({
      key: 'coinbase-usd',
      label: 'Coinbase USD',
      sub: 'Buying power',
      value: input.coinbase.usd_balance!,
    });
  }
  cashLines.sort((a, b) => b.value - a.value);
  const cashTotal = cashLines.reduce((s, l) => s + l.value, 0);

  // Liabilities: credit card balances (stored as negative).
  const liabilityLines: AssetLineData[] = [];
  for (const a of input.bankAccounts) {
    if (a.account_type !== 'credit_card' && a.account_type !== 'loan') continue;
    const balance = a.current_balance ?? 0;
    if (balance >= 0) continue; // not owed
    liabilityLines.push({
      key: `liab-${a.id}`,
      label: a.name,
      sub: a.institution ?? null,
      value: Math.abs(balance),
    });
  }
  liabilityLines.sort((a, b) => b.value - a.value);
  const liabilitiesTotal = liabilityLines.reduce((s, l) => s + l.value, 0);

  const netWorth = stocksTotal + cryptoTotal + cashTotal - liabilitiesTotal;
  return {
    netWorth,
    stocks,
    stocksTotal,
    cryptoLines,
    cryptoTotal,
    cashLines,
    cashTotal,
    liabilityLines,
    liabilitiesTotal,
  };
}

// ----- Subcomponents -----

const SECTION_COLORS = {
  stocks: ['#7c8cff', '#a855f7', '#22d3ee', '#f59e0b'],
};

function NetWorthCard({ agg }: { agg: Aggregated }) {
  const positive = agg.netWorth >= 0;
  return (
    <View style={styles.netCard}>
      <Text style={styles.netLabel}>NET WORTH</Text>
      <Text style={[styles.netValue, !positive && { color: colors.negative }]}>
        {formatPrice(agg.netWorth)}
      </Text>
      <View style={styles.netSubgrid}>
        <SubStat label="Assets" value={agg.stocksTotal + agg.cryptoTotal + agg.cashTotal} />
        <SubStat label="Debts" value={agg.liabilitiesTotal} negative />
        <SubStat label="Cash" value={agg.cashTotal} />
      </View>
    </View>
  );
}

function SubStat({
  label,
  value,
  negative,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <View style={styles.subStat}>
      <Text style={styles.subStatLabel}>{label}</Text>
      <Text
        style={[
          styles.subStatValue,
          negative && value > 0 ? { color: colors.negative } : null,
        ]}
      >
        {negative && value > 0 ? '−' : ''}
        {formatPrice(value)}
      </Text>
    </View>
  );
}

function AllocationStrip({ agg }: { agg: Aggregated }) {
  // Allocation as % of GROSS assets (ignoring debts) so a heavily-leveraged
  // user can still see what their actual asset mix is.
  const gross = agg.stocksTotal + agg.cryptoTotal + agg.cashTotal;
  if (gross <= 0) return null;
  const segments = [
    { label: 'Stocks', value: agg.stocksTotal, color: '#7c8cff' },
    { label: 'Crypto', value: agg.cryptoTotal, color: '#f7931a' },
    { label: 'Cash', value: agg.cashTotal, color: '#22c55e' },
  ].filter((s) => s.value > 0);
  return (
    <View style={styles.allocCard}>
      <Text style={styles.allocLabel}>ASSET ALLOCATION</Text>
      <View style={styles.allocBar}>
        {segments.map((s) => (
          <View
            key={s.label}
            style={{ flex: s.value / gross, backgroundColor: s.color, height: '100%' }}
          />
        ))}
      </View>
      <View style={styles.allocLegend}>
        {segments.map((s) => (
          <View key={s.label} style={styles.allocLegendItem}>
            <View style={[styles.allocLegendDot, { backgroundColor: s.color }]} />
            <Text style={styles.allocLegendText}>
              {s.label} · {Math.round((s.value / gross) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Section({
  icon,
  title,
  value,
  children,
  negative,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: number;
  negative?: boolean;
  children: React.ReactNode;
}) {
  const display = formatPrice(Math.abs(value));
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={14} color={colors.accent} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text
          style={[
            styles.sectionValue,
            negative ? { color: colors.negative } : null,
          ]}
        >
          {negative ? '−' : ''}
          {display}
        </Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function AssetLine({ line, negative }: { line: AssetLineData; negative?: boolean }) {
  return (
    <View style={styles.assetRow}>
      <View style={styles.assetBody}>
        <Text style={styles.assetLabel} numberOfLines={1}>
          {line.label}
        </Text>
        {line.sub ? <Text style={styles.assetSub}>{line.sub}</Text> : null}
      </View>
      <Text
        style={[
          styles.assetValue,
          negative ? { color: colors.negative } : null,
        ]}
      >
        {negative ? '−' : ''}
        {formatPrice(line.value)}
      </Text>
    </View>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="pie-chart-outline" size={28} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>Portfolio is empty</Text>
      <Text style={styles.emptyDesc}>
        Add stocks/ETFs manually, or connect a Coinbase + bank on the Accounts tab to populate
        crypto and cash automatically.
      </Text>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={18} color={colors.bg} />
        <Text style={styles.emptyButtonText}>Add a holding</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },

  netCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  netLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  netValue: {
    ...type.display,
    color: colors.text,
    fontSize: 36,
    fontVariant: ['tabular-nums' as const],
  },
  netSubgrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  subStat: { flex: 1, gap: 2 },
  subStatLabel: { ...type.micro, color: colors.textDim, letterSpacing: 0.4 },
  subStatValue: {
    ...type.heading,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
    fontSize: 14,
  },

  allocCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  allocLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  allocBar: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
  },
  allocLegend: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  allocLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  allocLegendDot: { width: 6, height: 6, borderRadius: 3 },
  allocLegendText: { ...type.micro, color: colors.textMuted },

  section: { gap: spacing.sm, marginTop: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 140, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { ...type.micro, color: colors.textMuted, flex: 1, letterSpacing: 0.8 },
  sectionValue: {
    ...type.heading,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
    fontSize: 14,
  },
  sectionBody: { gap: spacing.sm },
  assetRow: {
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
  assetBody: { flex: 1, gap: 2 },
  assetLabel: { ...type.heading, color: colors.text, fontSize: 14 },
  assetSub: { ...type.micro, color: colors.textMuted },
  assetValue: {
    ...type.heading,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
    fontSize: 14,
  },

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

  footer: {
    ...type.micro,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 16,
    paddingHorizontal: spacing.md,
  },
});
