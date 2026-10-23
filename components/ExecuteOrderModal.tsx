import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  type AnalysisData,
  type AssetType,
  type ExchangeAccount,
  type ExecuteOrderInput,
  type TradeIdea,
  type WatchlistItem,
} from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  item: WatchlistItem | null;
  tradeIdea: TradeIdea | null;
  analysisData: AnalysisData | null;
  onClose: () => void;
}

interface AccountOption {
  account: Extract<ExchangeAccount, { configured: true }> | ExchangeAccount;
  available: boolean;
  reason?: string;
}

function isAlpacaAccount(
  a: ExchangeAccount,
): a is Extract<ExchangeAccount, { provider: 'alpaca' }> {
  return a.provider === 'alpaca';
}

function parseSuggestedRiskPct(text: string | undefined): number | null {
  if (!text) return null;
  // Match "0.5% account risk" style phrasing
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 10) return null;
  return n;
}

export function ExecuteOrderModal({ visible, item, tradeIdea, analysisData, onClose }: Props) {
  const [accounts, setAccounts] = useState<ExchangeAccount[] | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [riskPct, setRiskPct] = useState<string>('0.5');
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderResult, setOrderResult] = useState<{ ok: true; provider: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setOrderResult(null);
    setError(null);
    const suggested = parseSuggestedRiskPct(analysisData?.position_sizing);
    setRiskPct(suggested != null ? String(suggested) : '0.5');
    setLoadingAccounts(true);
    apiClient
      .getExchangeAccounts()
      .then((r) => setAccounts(r.accounts))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load accounts'))
      .finally(() => setLoadingAccounts(false));
  }, [visible, analysisData]);

  // Filter accounts by asset compatibility (Alpaca for stocks/ETFs, Coinbase for crypto)
  // and pre-select the first usable one.
  const accountOptions: AccountOption[] = useMemo(() => {
    if (!accounts || !item) return [];
    return accounts.map((a) => {
      if (a.provider === 'alpaca' && (item.asset_type === 'stock' || item.asset_type === 'etf')) {
        if (!a.configured) return { account: a, available: false, reason: 'not configured' };
        if (a.account_blocked) return { account: a, available: false, reason: 'account blocked' };
        return { account: a, available: true };
      }
      if (a.provider === 'coinbase' && item.asset_type === 'crypto') {
        if (!a.configured) return { account: a, available: false, reason: 'not configured' };
        return { account: a, available: true };
      }
      return { account: a, available: false, reason: 'wrong asset type' };
    });
  }, [accounts, item]);

  useEffect(() => {
    if (selectedKey) return;
    const firstAvailable = accountOptions.find((o) => o.available);
    if (firstAvailable) setSelectedKey(accountKey(firstAvailable.account));
  }, [accountOptions, selectedKey]);

  const selected = accountOptions.find((o) => accountKey(o.account) === selectedKey)?.account;

  // Compute order parameters based on the selected account + sizing
  const computed = useMemo(() => {
    if (!tradeIdea || !selected) return null;
    const equity =
      selected.provider === 'alpaca' ? selected.equity ?? 0 : selected.usd_balance ?? 0;
    const pct = Number(riskPct);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    const dollarRisk = equity * (pct / 100);
    const entryMid = (tradeIdea.entry_zone[0] + tradeIdea.entry_zone[1]) / 2;
    const stopDistance = Math.abs(entryMid - tradeIdea.stop_loss);
    if (stopDistance <= 0 || entryMid <= 0) return null;
    const qty = dollarRisk / stopDistance;
    const notional = qty * entryMid;
    return {
      entryMid,
      dollarRisk,
      stopDistance,
      qty,
      notional,
      equity,
    };
  }, [tradeIdea, selected, riskPct]);

  const submit = async (): Promise<void> => {
    if (!tradeIdea || !selected || !item || !computed) return;
    setError(null);
    setPlacing(true);
    try {
      let payload: ExecuteOrderInput;
      if (selected.provider === 'alpaca') {
        // Alpaca stocks: round to integer shares (stocks don't support fractional in bracket)
        const shares = Math.max(1, Math.floor(computed.qty));
        payload = {
          provider: 'alpaca',
          env: selected.env,
          symbol: item.symbol,
          side: tradeIdea.direction === 'long' ? 'buy' : 'sell',
          qty: shares,
          limit_price: round2(tradeIdea.entry_zone[1]), // top of the entry zone
          stop_loss: round2(tradeIdea.stop_loss),
          take_profit: round2(tradeIdea.targets[0]!),
          time_in_force: 'gtc',
        };
      } else {
        // Coinbase: base_size in crypto units; limit at top of entry zone
        const baseSize = round8(computed.qty);
        payload = {
          provider: 'coinbase',
          product_id: `${item.symbol.toUpperCase()}-USD`,
          side: tradeIdea.direction === 'long' ? 'BUY' : 'SELL',
          base_size: baseSize,
          limit_price: round2(tradeIdea.entry_zone[1]),
        };
      }
      const result = await apiClient.placeOrder(payload);
      setOrderResult({ ok: true, provider: result.provider });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order placement failed');
    } finally {
      setPlacing(false);
    }
  };

  const handleClose = (): void => {
    setSelectedKey(null);
    setError(null);
    setOrderResult(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.eyebrow}>EXECUTE ORDER</Text>
                <Text style={styles.title}>{item?.symbol ?? ''}</Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              {orderResult ? (
                <View style={styles.successCard}>
                  <Ionicons name="checkmark-circle" size={32} color={colors.positive} />
                  <Text style={styles.successTitle}>Order submitted</Text>
                  <Text style={styles.successSub}>
                    Placed on {orderResult.provider === 'alpaca' ? 'Alpaca' : 'Coinbase'}. Check
                    your broker dashboard for fills.
                  </Text>
                  <Pressable onPress={handleClose} style={styles.doneButton}>
                    <Text style={styles.doneButtonText}>Done</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Trade plan summary */}
                  {tradeIdea && item ? (
                    <View style={styles.tradeSummary}>
                      <Text style={styles.summaryLabel}>TRADE PLAN</Text>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryK}>Direction</Text>
                        <Text
                          style={[
                            styles.summaryV,
                            {
                              color:
                                tradeIdea.direction === 'long' ? colors.positive : colors.negative,
                            },
                          ]}
                        >
                          {tradeIdea.direction.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryK}>Entry zone</Text>
                        <Text style={styles.summaryV}>
                          {formatPrice(tradeIdea.entry_zone[0], item.asset_type)} –{' '}
                          {formatPrice(tradeIdea.entry_zone[1], item.asset_type)}
                        </Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryK}>Stop</Text>
                        <Text style={[styles.summaryV, { color: colors.negative }]}>
                          {formatPrice(tradeIdea.stop_loss, item.asset_type)}
                        </Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryK}>Target 1</Text>
                        <Text style={[styles.summaryV, { color: colors.positive }]}>
                          {formatPrice(tradeIdea.targets[0]!, item.asset_type)}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Account picker */}
                  <View style={styles.field}>
                    <Text style={styles.label}>ACCOUNT</Text>
                    {loadingAccounts ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={styles.loadingText}>Loading accounts…</Text>
                      </View>
                    ) : accountOptions.length === 0 ? (
                      <Text style={styles.emptyText}>No exchange accounts configured.</Text>
                    ) : (
                      <View style={styles.accountList}>
                        {accountOptions.map((opt) => {
                          const key = accountKey(opt.account);
                          const isSelected = selectedKey === key;
                          return (
                            <Pressable
                              key={key}
                              onPress={() => opt.available && setSelectedKey(key)}
                              disabled={!opt.available}
                              style={[
                                styles.accountRow,
                                isSelected && styles.accountRowSelected,
                                !opt.available && styles.accountRowDisabled,
                              ]}
                            >
                              <View style={styles.accountInfo}>
                                <Text style={styles.accountLabel}>{opt.account.label}</Text>
                                {opt.account.provider === 'alpaca' && opt.account.equity != null ? (
                                  <Text style={styles.accountSub}>
                                    Equity {formatPrice(opt.account.equity)} · Buying power{' '}
                                    {formatPrice(opt.account.buying_power ?? 0)}
                                  </Text>
                                ) : opt.account.provider === 'coinbase' &&
                                  opt.account.usd_balance != null ? (
                                  <Text style={styles.accountSub}>
                                    USD balance {formatPrice(opt.account.usd_balance)}
                                  </Text>
                                ) : (
                                  <Text style={styles.accountSub}>{opt.reason}</Text>
                                )}
                              </View>
                              {isSelected ? (
                                <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Sizing */}
                  {selected && computed ? (
                    <View style={styles.field}>
                      <Text style={styles.label}>RISK PER TRADE (%)</Text>
                      <TextInput
                        style={styles.input}
                        value={riskPct}
                        onChangeText={setRiskPct}
                        keyboardType="decimal-pad"
                        placeholder="0.5"
                        placeholderTextColor={colors.textDim}
                      />
                      {analysisData?.position_sizing ? (
                        <Text style={styles.hint}>
                          Claude's suggestion: {analysisData.position_sizing}
                        </Text>
                      ) : null}

                      <View style={styles.computedCard}>
                        <View style={styles.computedRow}>
                          <Text style={styles.computedK}>Risking</Text>
                          <Text style={styles.computedV}>{formatPrice(computed.dollarRisk)}</Text>
                        </View>
                        <View style={styles.computedRow}>
                          <Text style={styles.computedK}>Stop distance</Text>
                          <Text style={styles.computedV}>
                            {formatPrice(computed.stopDistance, item?.asset_type)}
                          </Text>
                        </View>
                        <View style={styles.computedRow}>
                          <Text style={styles.computedK}>
                            {selected.provider === 'alpaca' ? 'Shares' : 'Crypto qty'}
                          </Text>
                          <Text style={styles.computedV}>
                            {selected.provider === 'alpaca'
                              ? Math.max(1, Math.floor(computed.qty))
                              : round8(computed.qty)}
                          </Text>
                        </View>
                        <View style={styles.computedRow}>
                          <Text style={styles.computedK}>Notional</Text>
                          <Text style={styles.computedV}>{formatPrice(computed.notional)}</Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {selected?.provider === 'coinbase' ? (
                    <View style={styles.warningBox}>
                      <Ionicons name="warning-outline" size={14} color={colors.warning} />
                      <Text style={styles.warningText}>
                        Coinbase doesn't support bracket orders. This places only the entry. You'll
                        need to set the stop + target manually on the exchange afterward.
                      </Text>
                    </View>
                  ) : null}

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <Pressable
                    onPress={() => void submit()}
                    disabled={placing || !selected || !computed || !tradeIdea}
                    style={({ pressed }) => [
                      styles.button,
                      (placing || !selected || !computed) && styles.buttonDisabled,
                      pressed && !placing && styles.buttonPressed,
                    ]}
                  >
                    {placing ? (
                      <ActivityIndicator color={colors.bg} />
                    ) : (
                      <Text style={styles.buttonText}>
                        {selected?.provider === 'alpaca' && selected.env === 'live'
                          ? 'Place LIVE order'
                          : selected?.provider === 'coinbase'
                            ? 'Place LIVE order'
                            : 'Place paper order'}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function accountKey(a: ExchangeAccount): string {
  if (a.provider === 'alpaca') return `alpaca:${a.env}`;
  return 'coinbase';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

// (intentional: re-export types referenced above so the file is self-contained)
type _unused = AssetType;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  center: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    maxHeight: '92%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  headerLeft: { gap: 2 },
  eyebrow: { ...type.micro, color: colors.accent, letterSpacing: 0.8 },
  title: { ...type.title, color: colors.text },
  scroll: { },
  successCard: { alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  successTitle: { ...type.title, color: colors.text },
  successSub: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  doneButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
  },
  doneButtonText: { ...type.heading, color: colors.bg },
  tradeSummary: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: 6,
    marginBottom: spacing.lg,
  },
  summaryLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8, marginBottom: spacing.xs },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryK: { ...type.caption, color: colors.textMuted },
  summaryV: { ...type.caption, color: colors.text, fontVariant: ['tabular-nums' as const] },
  field: { gap: spacing.sm, marginBottom: spacing.lg },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loadingText: { ...type.caption, color: colors.textMuted },
  emptyText: { ...type.caption, color: colors.textMuted },
  accountList: { gap: spacing.sm },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  accountRowSelected: { borderColor: colors.accent, backgroundColor: 'rgba(124, 140, 255, 0.08)' },
  accountRowDisabled: { opacity: 0.45 },
  accountInfo: { flex: 1, gap: 2 },
  accountLabel: { ...type.caption, color: colors.text, fontWeight: '600' },
  accountSub: { ...type.micro, color: colors.textMuted },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  hint: { ...type.micro, color: colors.textDim, marginTop: spacing.xs, lineHeight: 16 },
  computedCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: 6,
    marginTop: spacing.sm,
  },
  computedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  computedK: { ...type.caption, color: colors.textMuted },
  computedV: { ...type.caption, color: colors.text, fontVariant: ['tabular-nums' as const], fontWeight: '600' },
  warningBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    marginBottom: spacing.lg,
  },
  warningText: { ...type.micro, color: colors.warning, flex: 1, lineHeight: 16 },
  error: { ...type.caption, color: colors.negative, marginBottom: spacing.md },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { ...type.heading, color: colors.bg },
});
