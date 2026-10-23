import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, type BillInput, type RecurringCandidate } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after candidates are imported so the parent can refetch bills. */
  onImported: (count: number) => void;
}

/**
 * Pulls candidate recurring charges from /api/banking/recurring, lets the user
 * cherry-pick which ones to convert into Bills (auto_detected=true), then
 * POSTs each selected candidate as a new Bill. Title-cases the merchant name
 * for display since SimpleFIN strings come in as ALL CAPS.
 */
export function DetectBillsModal({ visible, onClose, onImported }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RecurringCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const candidateKey = (c: RecurringCandidate): string =>
    `${c.merchant}::${c.cadence}::${c.median_amount}`;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const run = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.detectRecurringBills(180);
        if (cancelled) return;
        setCandidates(data.candidates);
        // Pre-select everything with confidence >= 60 so the common case is one click.
        const auto = new Set<string>();
        for (const c of data.candidates) {
          if (c.confidence >= 60) auto.add(candidateKey(c));
        }
        setSelected(auto);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to scan');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const selectedCount = selected.size;
  const totalMonthly = useMemo(() => {
    let m = 0;
    for (const c of candidates) {
      if (!selected.has(candidateKey(c))) continue;
      m += monthlyEquivalent(c.median_amount, c.cadence);
    }
    return m;
  }, [candidates, selected]);

  const toggle = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleImport = async (): Promise<void> => {
    if (selectedCount === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const picked = candidates.filter((c) => selected.has(candidateKey(c)));
      // Run in parallel but cap concurrency to avoid hammering the backend.
      const batch = 4;
      let imported = 0;
      for (let i = 0; i < picked.length; i += batch) {
        const chunk = picked.slice(i, i + batch);
        await Promise.all(
          chunk.map(async (c) => {
            const input: BillInput = {
              name: titleCase(c.merchant),
              merchant: c.merchant,
              amount: c.median_amount,
              cadence: c.cadence,
              next_due_date: c.next_estimated,
              auto_detected: true,
            };
            await apiClient.addBill(input);
            imported += 1;
          }),
        );
      }
      onImported(imported);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
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
              <Text style={styles.eyebrow}>DETECT RECURRING</Text>
              <Text style={styles.title}>
                {loading ? 'Scanning…' : `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
              </Text>
              {!loading && candidates.length > 0 ? (
                <Text style={styles.subtitle}>
                  {selectedCount} selected · ~{formatPrice(totalMonthly)}/mo
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
              <Text style={styles.loadingText}>
                Analyzing last 180 days of transactions…
              </Text>
            </View>
          ) : error && candidates.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={28} color={colors.negative} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : candidates.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="checkmark-circle-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                No new recurring bills found. Either nothing recurred at least twice in your
                history, or everything is already in your Bills list.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {candidates.map((c) => {
                const key = candidateKey(c);
                const checked = selected.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggle(key)}
                    style={({ pressed }) => [
                      styles.row,
                      checked && styles.rowChecked,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        checked && styles.checkboxChecked,
                      ]}
                    >
                      {checked ? <Ionicons name="checkmark" size={14} color={colors.bg} /> : null}
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {titleCase(c.merchant)}
                      </Text>
                      <View style={styles.rowMetaRow}>
                        <Text style={styles.rowMeta}>{c.cadence_label}</Text>
                        <Text style={styles.rowMetaDim}>·</Text>
                        <Text style={styles.rowMeta}>{c.occurrences} charges</Text>
                        <Text style={styles.rowMetaDim}>·</Text>
                        <Text style={styles.rowMeta}>next ~{c.next_estimated}</Text>
                      </View>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={styles.rowAmount}>{formatPrice(c.median_amount)}</Text>
                      <ConfidenceBadge confidence={c.confidence} />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {!loading && candidates.length > 0 ? (
            <View style={styles.footer}>
              {error ? <Text style={styles.footerError}>{error}</Text> : null}
              <Pressable
                onPress={() => void handleImport()}
                disabled={submitting || selectedCount === 0}
                style={({ pressed }) => [
                  styles.importBtn,
                  (submitting || selectedCount === 0) && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <>
                    <Ionicons name="add" size={16} color={colors.bg} />
                    <Text style={styles.importBtnText}>
                      Add {selectedCount} bill{selectedCount === 1 ? '' : 's'}
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

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 75 ? colors.positive : confidence >= 60 ? colors.warning : colors.textMuted;
  return (
    <View style={[styles.confidence, { borderColor: `${color}55` }]}>
      <Text style={[styles.confidenceText, { color }]}>{confidence}%</Text>
    </View>
  );
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

/**
 * Monthly equivalent for the totals strip — mirrors the backend's monthlyEquivalent.
 */
function monthlyEquivalent(amount: number, cadence: string): number {
  switch (cadence) {
    case 'weekly':
      return amount * (52 / 12);
    case 'biweekly':
      return amount * (26 / 12);
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'annual':
      return amount / 12;
    default:
      return amount;
  }
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
  loadingText: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  errorText: { ...type.body, color: colors.negative, textAlign: 'center' },
  emptyText: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 19,
  },
  list: { maxHeight: 500 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.md },
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
  rowChecked: { borderColor: colors.accent, backgroundColor: 'rgba(124, 140, 255, 0.06)' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  rowBody: { flex: 1, gap: 2 },
  rowName: { ...type.heading, color: colors.text, fontSize: 14 },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  rowMeta: { ...type.micro, color: colors.textMuted },
  rowMetaDim: { ...type.micro, color: colors.textDim },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowAmount: {
    ...type.heading,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
    fontSize: 14,
  },
  confidence: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  confidenceText: { ...type.micro, fontWeight: '700', fontSize: 9, letterSpacing: 0.4 },
  footer: { gap: spacing.sm, marginTop: spacing.sm },
  footerError: { ...type.caption, color: colors.negative },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
  },
  importBtnText: { ...type.heading, color: colors.bg, fontSize: 14 },
});
