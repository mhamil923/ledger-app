import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, type HeaderAction } from '../../components/ScreenHeader';
import { BillRow } from '../../components/BillRow';
import { AddBillModal } from '../../components/AddBillModal';
import { DetectBillsModal } from '../../components/DetectBillsModal';
import { AddAnnualFeesModal } from '../../components/AddAnnualFeesModal';
import { apiClient, type Bill } from '../../lib/api';
import { formatPrice } from '../../lib/format';
import { colors, radius, spacing, type } from '../../theme/colors';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface BillSection {
  title: string;
  bills: Bill[];
}

export default function BillsScreen() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [detectOpen, setDetectOpen] = useState(false);
  const [annualFeesOpen, setAnnualFeesOpen] = useState(false);

  const billsQuery = useQuery({
    queryKey: ['bills'],
    queryFn: apiClient.getBills,
  });

  const refetchBills = billsQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchBills();
    }, [refetchBills]),
  );

  const addMutation = useMutation({
    mutationFn: apiClient.addBill,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bills'] }),
  });

  const payMutation = useMutation({
    mutationFn: (input: { id: string; paid_at: string }) =>
      apiClient.markBillPaid(input.id, input.paid_at),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bills'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: apiClient.deleteBill,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bills'] }),
  });

  const handleMarkPaid = (bill: Bill): void => {
    const confirmMsg = `Mark ${bill.name} as paid? Due date will advance to the next ${bill.cadence} cycle.`;
    const proceed = (): void => {
      payMutation.mutate({ id: bill.id, paid_at: todayIso() });
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(confirmMsg)) proceed();
      return;
    }
    Alert.alert('Mark paid?', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark paid', onPress: proceed },
    ]);
  };

  const handleDelete = (bill: Bill): void => {
    const message = `Delete ${bill.name}?`;
    const proceed = (): void => deleteMutation.mutate(bill.id);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) proceed();
      return;
    }
    Alert.alert('Delete bill?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: proceed },
    ]);
  };

  const sections = groupBills(billsQuery.data?.bills ?? []);
  const flatItems: Array<{ type: 'header'; title: string } | { type: 'bill'; bill: Bill }> = [];
  for (const section of sections) {
    if (section.bills.length === 0) continue;
    flatItems.push({ type: 'header', title: section.title });
    for (const b of section.bills) flatItems.push({ type: 'bill', bill: b });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        eyebrow="LAYER 5"
        title="Bills"
        subtitle={
          billsQuery.data
            ? `${billsQuery.data.bills.filter((b) => b.active).length} active · ${formatPrice(billsQuery.data.monthly_total)}/mo`
            : 'Recurring bills'
        }
        actions={[
          {
            icon: 'sparkles-outline',
            onPress: () => setDetectOpen(true),
            accessibilityLabel: 'Detect recurring bills from transactions',
          },
          {
            icon: 'card-outline',
            onPress: () => setAnnualFeesOpen(true),
            accessibilityLabel: 'Add credit card annual fees',
          },
          {
            icon: 'add',
            onPress: () => setAddOpen(true),
            accessibilityLabel: 'Add a bill manually',
          },
        ] as HeaderAction[]}
      />

      {billsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : billsQuery.isError ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Couldn't load bills</Text>
          <Pressable onPress={() => void billsQuery.refetch()} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : flatItems.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <FlatList
          data={flatItems}
          keyExtractor={(item) => (item.type === 'header' ? `h-${item.title}` : item.bill.id)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            billsQuery.data ? (
              <View style={styles.summary}>
                <Text style={styles.summaryLabel}>MONTHLY EQUIVALENT</Text>
                <Text style={styles.summaryValue}>{formatPrice(billsQuery.data.monthly_total)}</Text>
                <Text style={styles.summaryHint}>
                  Active recurring bills normalized to monthly cost.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            if (item.type === 'header') {
              return (
                <Text style={[styles.sectionHeader, index === 0 && styles.sectionHeaderFirst]}>
                  {item.title}
                </Text>
              );
            }
            return (
              <View style={styles.billWrap}>
                <BillRow
                  bill={item.bill}
                  onMarkPaid={handleMarkPaid}
                  onDelete={handleDelete}
                  onUseLatestAmount={(bill, amount) => {
                    void apiClient.updateBill(bill.id, { amount }).then(() => {
                      void queryClient.invalidateQueries({ queryKey: ['bills'] });
                      void queryClient.invalidateQueries({ queryKey: ['budget'] });
                    });
                  }}
                />
              </View>
            );
          }}
          refreshControl={
            <RefreshControl
              refreshing={billsQuery.isFetching && !billsQuery.isLoading}
              onRefresh={() => void billsQuery.refetch()}
              tintColor={colors.accent}
            />
          }
        />
      )}

      <AddBillModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          await addMutation.mutateAsync(input);
        }}
      />

      <DetectBillsModal
        visible={detectOpen}
        onClose={() => setDetectOpen(false)}
        onImported={() => {
          void queryClient.invalidateQueries({ queryKey: ['bills'] });
        }}
      />

      <AddAnnualFeesModal
        visible={annualFeesOpen}
        onClose={() => setAnnualFeesOpen(false)}
        onImported={() => {
          void queryClient.invalidateQueries({ queryKey: ['bills'] });
        }}
      />
    </SafeAreaView>
  );
}

function groupBills(bills: Bill[]): BillSection[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  const overdue: Bill[] = [];
  const thisWeek: Bill[] = [];
  const upcoming: Bill[] = [];
  const inactive: Bill[] = [];

  for (const b of bills) {
    if (!b.active) {
      inactive.push(b);
      continue;
    }
    if (!b.next_due_date) {
      upcoming.push(b);
      continue;
    }
    const due = new Date(`${b.next_due_date}T00:00:00`).getTime();
    if (due < todayMs) overdue.push(b);
    else if (due - todayMs <= weekMs) thisWeek.push(b);
    else upcoming.push(b);
  }

  return [
    { title: 'OVERDUE', bills: overdue },
    { title: 'DUE THIS WEEK', bills: thisWeek },
    { title: 'UPCOMING', bills: upcoming },
    { title: 'INACTIVE', bills: inactive },
  ];
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="calendar-outline" size={28} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>No bills yet</Text>
      <Text style={styles.emptyDesc}>
        Track recurring expenses — rent, subscriptions, insurance, utilities. Mark them paid when you
        pay them and the due date advances automatically.
      </Text>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={18} color={colors.bg} />
        <Text style={styles.emptyButtonText}>Add a bill</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
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
  sectionHeader: {
    ...type.micro,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionHeaderFirst: { marginTop: 0 },
  billWrap: { marginBottom: spacing.sm },
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
});
