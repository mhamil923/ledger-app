import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AddLotModal } from '../../components/AddLotModal';
import { apiClient, type HoldingLot, type HoldingSummary } from '../../lib/api';
import { formatPercent, formatPrice } from '../../lib/format';
import { colors, radius, spacing, type } from '../../theme/colors';

export default function HoldingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addLotOpen, setAddLotOpen] = useState(false);

  const holdingQuery = useQuery({
    queryKey: ['holding', id],
    queryFn: () => apiClient.getHolding(id!),
    enabled: !!id,
    refetchInterval: 60_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['holding', id] });
    void queryClient.invalidateQueries({ queryKey: ['portfolio'] });
  };

  const addLotMutation = useMutation({
    mutationFn: (lot: Parameters<typeof apiClient.addLot>[1]) => apiClient.addLot(id!, lot),
    onSuccess: invalidate,
  });

  const deleteLotMutation = useMutation({
    mutationFn: apiClient.deleteLot,
    onSuccess: invalidate,
  });

  const updateNotesMutation = useMutation({
    mutationFn: (notes: string | null) => apiClient.updateHoldingNotes(id!, notes),
    onSuccess: invalidate,
  });

  const deleteHoldingMutation = useMutation({
    mutationFn: apiClient.deleteHolding,
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const confirm = (title: string, message: string, onConfirm: () => void): void => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  };

  const handleDeleteLot = (lot: HoldingLot): void => {
    confirm(
      'Remove lot?',
      `Remove ${Number(lot.quantity).toLocaleString('en-US', { maximumFractionDigits: 8 })} @ ${formatPrice(Number(lot.cost_per_unit))} from ${lot.acquired_at}?`,
      () => deleteLotMutation.mutate(lot.id),
    );
  };

  const handleDeleteHolding = (): void => {
    if (!holdingQuery.data) return;
    confirm(
      'Delete holding?',
      `Delete ${holdingQuery.data.holding.symbol} and all ${holdingQuery.data.lots.length} lot${holdingQuery.data.lots.length === 1 ? '' : 's'}? This cannot be undone.`,
      () => deleteHoldingMutation.mutate(id!),
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitle: holdingQuery.data?.holding.symbol ?? '',
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.root} edges={['bottom']}>
        {holdingQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : holdingQuery.isError || !holdingQuery.data ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
            <Text style={styles.errorTitle}>Couldn't load holding</Text>
            <Pressable
              onPress={() => void holdingQuery.refetch()}
              style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.smallButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={holdingQuery.data.lots}
            keyExtractor={(lot) => lot.id}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <HoldingHeader
                holding={holdingQuery.data.holding}
                onAddLot={() => setAddLotOpen(true)}
                onDelete={handleDeleteHolding}
                onSaveNotes={(notes) => updateNotesMutation.mutateAsync(notes)}
                savingNotes={updateNotesMutation.isPending}
              />
            }
            renderItem={({ item }) => <LotRow lot={item} onDelete={handleDeleteLot} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <Text style={styles.emptyLots}>
                This holding has no lots yet. Add one to start tracking cost basis and P&L.
              </Text>
            }
            refreshControl={
              <RefreshControl
                refreshing={holdingQuery.isFetching && !holdingQuery.isLoading}
                onRefresh={() => void holdingQuery.refetch()}
                tintColor={colors.accent}
              />
            }
          />
        )}

        <AddLotModal
          visible={addLotOpen}
          symbol={holdingQuery.data?.holding.symbol ?? ''}
          onClose={() => setAddLotOpen(false)}
          onSubmit={async (lot) => {
            await addLotMutation.mutateAsync(lot);
          }}
        />
      </SafeAreaView>
    </>
  );
}

function HoldingHeader({
  holding,
  onAddLot,
  onDelete,
  onSaveNotes,
  savingNotes,
}: {
  holding: HoldingSummary;
  onAddLot: () => void;
  onDelete: () => void;
  onSaveNotes: (notes: string | null) => Promise<unknown>;
  savingNotes: boolean;
}) {
  const pl = holding.unrealized_pl;
  const plPct = holding.unrealized_pl_pct;
  const positive = (pl ?? 0) >= 0;
  const plColor = pl == null ? colors.textDim : positive ? colors.positive : colors.negative;

  return (
    <View style={styles.header}>
      <View style={styles.headerCard}>
        <Text style={styles.label}>MARKET VALUE</Text>
        <Text style={styles.value}>
          {holding.market_value != null ? formatPrice(holding.market_value) : '—'}
        </Text>
        {pl != null && plPct != null ? (
          <View style={styles.plRow}>
            <Ionicons
              name={positive ? 'caret-up' : 'caret-down'}
              size={14}
              color={plColor}
            />
            <Text style={[styles.plText, { color: plColor }]}>
              {formatPrice(Math.abs(pl))} ({formatPercent(plPct)})
            </Text>
          </View>
        ) : holding.quote_error ? (
          <View style={styles.warningRow}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
            <Text style={styles.warningText}>{holding.quote_error}</Text>
          </View>
        ) : null}

        <View style={styles.metricsRow}>
          <Metric label="QUANTITY" value={formatNumber(holding.total_quantity)} />
          <View style={styles.metricsDivider} />
          <Metric label="AVG COST" value={formatPrice(holding.avg_cost, holding.asset_type)} />
          <View style={styles.metricsDivider} />
          <Metric
            label="CURRENT"
            value={holding.current_price != null ? formatPrice(holding.current_price, holding.asset_type) : '—'}
          />
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onAddLot}
          style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={18} color={colors.bg} />
          <Text style={styles.primaryActionText}>Add lot</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={({ pressed }) => [styles.destructiveAction, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.negative} />
          <Text style={styles.destructiveActionText}>Delete</Text>
        </Pressable>
      </View>

      <NotesEditor
        notes={holding.notes}
        onSave={onSaveNotes}
        saving={savingNotes}
      />

      <Text style={styles.sectionLabel}>LOTS</Text>
    </View>
  );
}

function NotesEditor({
  notes,
  onSave,
  saving,
}: {
  notes: string | null;
  onSave: (notes: string | null) => Promise<unknown>;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? '');

  useEffect(() => {
    if (!editing) setDraft(notes ?? '');
  }, [notes, editing]);

  const handleSave = async (): Promise<void> => {
    const trimmed = draft.trim();
    await onSave(trimmed || null);
    setEditing(false);
  };

  const handleCancel = (): void => {
    setDraft(notes ?? '');
    setEditing(false);
  };

  if (!editing && !notes) {
    return (
      <Pressable
        onPress={() => setEditing(true)}
        style={({ pressed }) => [styles.notesAddCta, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="add-circle-outline" size={16} color={colors.textMuted} />
        <Text style={styles.notesAddCtaText}>Add a note (account, lot strategy, etc.)</Text>
      </Pressable>
    );
  }

  if (!editing) {
    return (
      <Pressable
        onPress={() => setEditing(true)}
        style={({ pressed }) => [styles.notesView, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.notesHeader}>
          <Text style={styles.notesLabel}>NOTES</Text>
          <Ionicons name="pencil" size={14} color={colors.textDim} />
        </View>
        <Text style={styles.notesText}>{notes}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.notesEditing}>
      <Text style={styles.notesLabel}>NOTES</Text>
      <TextInput
        style={styles.notesInput}
        value={draft}
        onChangeText={setDraft}
        placeholder="e.g. taxable account, cold storage, DCA strategy…"
        placeholderTextColor={colors.textDim}
        multiline
        maxLength={2000}
        autoFocus
      />
      <View style={styles.notesActions}>
        <Pressable
          onPress={handleCancel}
          disabled={saving}
          style={({ pressed }) => [styles.notesCancel, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.notesCancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving}
          style={({ pressed }) => [
            styles.notesSave,
            saving && { opacity: 0.6 },
            pressed && !saving && { opacity: 0.85 },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <Text style={styles.notesSaveText}>Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function LotRow({ lot, onDelete }: { lot: HoldingLot; onDelete: (lot: HoldingLot) => void }) {
  const qty = Number(lot.quantity);
  const cost = Number(lot.cost_per_unit);
  const total = qty * cost;

  return (
    <View style={styles.lotRow}>
      <View style={styles.lotMain}>
        <View style={styles.lotTopRow}>
          <Text style={styles.lotQty}>{formatNumber(qty)}</Text>
          <Text style={styles.lotTotal}>{formatPrice(total)}</Text>
        </View>
        <View style={styles.lotBottomRow}>
          <Text style={styles.lotSub}>
            @ {formatPrice(cost)} · {lot.acquired_at}
          </Text>
          <Pressable onPress={() => onDelete(lot)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textDim} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  errorTitle: { ...type.title, color: colors.text, marginTop: spacing.sm },
  smallButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallButtonText: { ...type.caption, color: colors.text },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  separator: { height: spacing.sm },
  header: { gap: spacing.lg, paddingBottom: spacing.lg },
  headerCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  value: { ...type.display, color: colors.text, fontSize: 30, fontVariant: ['tabular-nums' as const] },
  plRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  plText: { ...type.body, fontVariant: ['tabular-nums' as const], fontWeight: '600' },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warningText: { ...type.caption, color: colors.warning },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  metric: { flex: 1, gap: 2 },
  metricsDivider: { width: 1, height: 28, backgroundColor: colors.borderSubtle, marginHorizontal: spacing.md },
  metricLabel: { ...type.micro, color: colors.textDim, letterSpacing: 0.5 },
  metricValue: { ...type.caption, color: colors.text, fontVariant: ['tabular-nums' as const], fontSize: 14, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: spacing.md },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
  },
  primaryActionText: { ...type.heading, color: colors.bg },
  destructiveAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  destructiveActionText: { ...type.caption, color: colors.negative, fontWeight: '600' },
  notesAddCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: 'dashed',
  },
  notesAddCtaText: { ...type.caption, color: colors.textMuted, flex: 1 },
  notesView: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  notesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notesLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  notesText: { ...type.body, color: colors.text, lineHeight: 22 },
  notesEditing: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  notesInput: {
    minHeight: 80,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  notesActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  notesCancel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
  },
  notesCancelText: { ...type.caption, color: colors.textMuted, fontWeight: '600' },
  notesSave: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    minWidth: 72,
    alignItems: 'center',
  },
  notesSaveText: { ...type.caption, color: colors.bg, fontWeight: '700' },
  sectionLabel: {
    ...type.micro,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  lotRow: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
  },
  lotMain: { gap: 6 },
  lotTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  lotQty: { ...type.heading, color: colors.text, fontVariant: ['tabular-nums' as const] },
  lotTotal: { ...type.caption, color: colors.textMuted, fontVariant: ['tabular-nums' as const] },
  lotBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lotSub: { ...type.caption, color: colors.textDim },
  emptyLots: {
    ...type.body,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.xl,
    lineHeight: 22,
  },
});
