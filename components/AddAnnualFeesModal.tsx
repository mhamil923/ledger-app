import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
  type BankAccount,
  type BillInput,
  type DetectedAnnualFee,
} from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}

interface RowState {
  amount: string; // string so partial typing doesn't error
  date: string; // YYYY-MM-DD next due date
  /** True when this row was pre-filled from a detected past charge. */
  detected?: boolean;
}

/**
 * Lists the user's credit-card accounts and lets them enter the annual fee +
 * next billing date for each. Submitting creates one Bill per filled row with
 * cadence='annual' and auto_detected=false. Empty / zero rows are skipped.
 */
export function AddAnnualFeesModal({ visible, onClose, onImported }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<BankAccount[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const run = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        // Fetch accounts + detected fees in parallel — second one is best-effort.
        const [accountsRes, feesRes] = await Promise.allSettled([
          apiClient.getBankAccounts(),
          apiClient.detectAnnualFees(),
        ]);
        if (cancelled) return;
        const accounts =
          accountsRes.status === 'fulfilled' ? accountsRes.value.accounts ?? [] : [];
        const ccs = accounts.filter((a) => a.account_type === 'credit_card');
        setCards(ccs);

        const feesByAccount = new Map<string, DetectedAnnualFee>();
        if (feesRes.status === 'fulfilled') {
          for (const f of feesRes.value.fees) feesByAccount.set(f.account_id, f);
        }

        const initial: Record<string, RowState> = {};
        for (const a of ccs) {
          const detected = feesByAccount.get(a.id);
          if (detected) {
            initial[a.id] = {
              amount: String(detected.amount),
              date: detected.next_estimated,
              detected: true,
            };
          } else {
            initial[a.id] = { amount: '', date: nextAnniversaryGuess() };
          }
        }
        setRows(initial);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load cards');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const ready = useMemo(() => {
    const picked: { card: BankAccount; amount: number; date: string }[] = [];
    for (const card of cards) {
      const r = rows[card.id];
      if (!r) continue;
      const amount = Number(r.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
      picked.push({ card, amount, date: r.date });
    }
    return picked;
  }, [cards, rows]);

  const totalAnnual = ready.reduce((s, p) => s + p.amount, 0);

  const updateRow = (id: string, patch: Partial<RowState>): void => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  };

  const handleSubmit = async (): Promise<void> => {
    if (ready.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      let imported = 0;
      for (const p of ready) {
        const name = `${p.card.institution ?? p.card.name} Annual Fee`;
        const input: BillInput = {
          name,
          merchant: p.card.name,
          amount: p.amount,
          cadence: 'annual',
          next_due_date: p.date,
          auto_detected: false,
        };
        await apiClient.addBill(input);
        imported += 1;
      }
      onImported(imported);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bills');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>CREDIT CARDS</Text>
              <Text style={styles.title}>Add Annual Fees</Text>
              {cards.length > 0 && !loading ? (
                <Text style={styles.subtitle}>
                  {ready.length} ready · {formatPrice(totalAnnual)}/yr
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
          ) : cards.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="card-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                No credit card accounts found. Connect one via SimpleFIN on the Accounts tab
                first.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              <Text style={styles.helpText}>
                Rows marked DETECTED were pre-filled from a matching annual-fee charge in your
                transaction history — verify the amount and date are right. Leave any blank to
                skip.
              </Text>
              {cards.map((card) => {
                const r = rows[card.id] ?? { amount: '', date: '' };
                return (
                  <View key={card.id} style={styles.cardRow}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardIcon}>
                        <Ionicons name="card-outline" size={16} color={colors.accent} />
                      </View>
                      <View style={styles.cardName}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {card.institution ?? card.name}
                        </Text>
                        <Text style={styles.cardMeta}>
                          {card.name}
                          {card.mask ? ` · ··${card.mask}` : ''}
                        </Text>
                      </View>
                      {r.detected ? (
                        <View style={styles.detectedBadge}>
                          <Ionicons name="sparkles" size={9} color={colors.positive} />
                          <Text style={styles.detectedText}>DETECTED</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.inputsRow}>
                      <View style={[styles.field, { flex: 1 }]}>
                        <Text style={styles.label}>FEE</Text>
                        <View style={styles.amountWrap}>
                          <Text style={styles.amountPrefix}>$</Text>
                          <TextInput
                            value={r.amount}
                            onChangeText={(t) => updateRow(card.id, { amount: t })}
                            placeholder="0"
                            placeholderTextColor={colors.textDim}
                            keyboardType="decimal-pad"
                            style={styles.amountInput}
                          />
                        </View>
                      </View>
                      <View style={[styles.field, { flex: 1.4 }]}>
                        <Text style={styles.label}>NEXT DUE</Text>
                        <TextInput
                          value={r.date}
                          onChangeText={(t) => updateRow(card.id, { date: t })}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.textDim}
                          autoCorrect={false}
                          autoCapitalize="none"
                          style={styles.input}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {!loading && cards.length > 0 ? (
            <View style={styles.footer}>
              {error ? <Text style={styles.footerError}>{error}</Text> : null}
              <Pressable
                onPress={() => void handleSubmit()}
                disabled={submitting || ready.length === 0}
                style={({ pressed }) => [
                  styles.submitBtn,
                  (submitting || ready.length === 0) && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <>
                    <Ionicons name="add" size={16} color={colors.bg} />
                    <Text style={styles.submitBtnText}>
                      Add {ready.length} annual bill{ready.length === 1 ? '' : 's'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Sensible default: one year from today in YYYY-MM-DD. Users can edit per row.
 */
function nextAnniversaryGuess(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  backdropPress: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  eyebrow: { ...type.micro, color: colors.accent, letterSpacing: 0.8 },
  title: { ...type.title, color: colors.text, marginTop: 2 },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
  emptyText: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 19,
  },
  list: { maxHeight: 520 },
  listContent: { gap: spacing.md, paddingBottom: spacing.md },
  helpText: {
    ...type.caption,
    color: colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  cardRow: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(124, 140, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { flex: 1, gap: 2 },
  cardTitle: { ...type.heading, color: colors.text, fontSize: 14 },
  cardMeta: { ...type.micro, color: colors.textMuted },
  detectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(76, 217, 100, 0.12)',
    borderColor: 'rgba(76, 217, 100, 0.35)',
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  detectedText: {
    ...type.micro,
    color: colors.positive,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  inputsRow: { flexDirection: 'row', gap: spacing.sm },
  field: { gap: 4 },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.5, fontSize: 9 },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.sm,
  },
  amountPrefix: { ...type.body, color: colors.textMuted, fontSize: 14 },
  amountInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    fontSize: 14,
    fontVariant: ['tabular-nums' as const],
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    fontVariant: ['tabular-nums' as const],
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  footer: { gap: spacing.sm, marginTop: spacing.sm },
  footerError: { ...type.caption, color: colors.negative },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
  },
  submitBtnText: { ...type.heading, color: colors.bg, fontSize: 14 },
});
