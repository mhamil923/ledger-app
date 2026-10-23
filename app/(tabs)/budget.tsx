import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AddBudgetCategoryModal } from '../../components/AddBudgetCategoryModal';
import { BudgetCategoryRow } from '../../components/BudgetCategoryRow';
import {
  apiClient,
  type BudgetCategory,
  type BudgetResponse,
} from '../../lib/api';
import { formatPrice } from '../../lib/format';
import { colors, radius, spacing, type } from '../../theme/colors';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function displayMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function BudgetScreen() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetCategory | null>(null);
  const [incomeDraft, setIncomeDraft] = useState<string>('');
  const [savingsDraft, setSavingsDraft] = useState<string>('');

  const budgetQuery = useQuery<BudgetResponse>({
    queryKey: ['budget', month],
    queryFn: () => apiClient.getBudget(month),
  });

  // Only refetch on focus using stable refetch reference (avoids the infinite
  // loop bug the other tabs had before).
  const refetchBudget = budgetQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchBudget();
    }, [refetchBudget]),
  );

  const budget = budgetQuery.data?.budget ?? null;
  const categories = budgetQuery.data?.categories ?? [];
  const actuals = budgetQuery.data?.actuals ?? null;
  const summary = budgetQuery.data?.summary ?? null;

  // Sync the editable income/savings inputs whenever the fetched budget
  // changes (month switch, initial load), but not while the user is typing
  // — that's handled by explicit blur/submit.
  useMemo(() => {
    if (!budget) return;
    setIncomeDraft(String(budget.monthly_income || ''));
    setSavingsDraft(String(budget.savings_target || ''));
  }, [budget]);

  const updateBudgetMutation = useMutation({
    mutationFn: (input: { monthly_income?: number; savings_target?: number }) =>
      apiClient.updateBudget(budget!.id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget', month] }),
  });

  const addCategoryMutation = useMutation({
    mutationFn: (input: {
      name: string;
      monthly_limit: number;
      match_patterns?: string[];
    }) => apiClient.addBudgetCategory(budget!.id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget', month] }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: (input: {
      id: string;
      patch: { name?: string; monthly_limit?: number; match_patterns?: string[] };
    }) => apiClient.updateBudgetCategory(budget!.id, input.id, input.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget', month] }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (categoryId: string) =>
      apiClient.deleteBudgetCategory(budget!.id, categoryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget', month] }),
  });

  const commitIncome = (): void => {
    if (!budget) return;
    const n = Number(incomeDraft);
    if (!Number.isFinite(n) || n < 0) return;
    if (n === budget.monthly_income) return;
    updateBudgetMutation.mutate({ monthly_income: n });
  };

  const commitSavings = (): void => {
    if (!budget) return;
    const n = Number(savingsDraft);
    if (!Number.isFinite(n) || n < 0) return;
    if (n === budget.savings_target) return;
    updateBudgetMutation.mutate({ savings_target: n });
  };

  const handleDelete = (cat: BudgetCategory): void => {
    const message = `Delete "${cat.name}"? Its spending won't be re-counted anywhere until you add a new category with matching patterns.`;
    const proceed = (): void => deleteCategoryMutation.mutate(cat.id);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) proceed();
      return;
    }
    Alert.alert('Delete category?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: proceed },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        eyebrow="LAYER 6"
        title="Budget"
        subtitle={displayMonth(month)}
        rightIcon="add"
        onRightPress={() => {
          setEditing(null);
          setAddOpen(true);
        }}
      />

      {budgetQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : budgetQuery.isError ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Couldn't load budget</Text>
          <Text style={styles.emptyDesc}>
            {budgetQuery.error instanceof Error
              ? budgetQuery.error.message
              : 'Unknown error'}
          </Text>
          <Pressable onPress={() => void budgetQuery.refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : summary && budget && actuals ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={budgetQuery.isFetching && !budgetQuery.isLoading}
              onRefresh={() => void budgetQuery.refetch()}
              tintColor={colors.accent}
            />
          }
        >
          {/* Month chips */}
          <View style={styles.monthRow}>
            <Pressable
              onPress={() => setMonth(shiftMonth(month, -1))}
              style={({ pressed }) => [
                styles.monthBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="chevron-back" size={16} color={colors.text} />
              <Text style={styles.monthBtnText}>{displayMonth(shiftMonth(month, -1))}</Text>
            </Pressable>
            <Pressable
              onPress={() => setMonth(currentMonth())}
              disabled={month === currentMonth()}
              style={({ pressed }) => [
                styles.monthBtn,
                month === currentMonth() && styles.monthBtnActive,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text
                style={[
                  styles.monthBtnText,
                  month === currentMonth() && styles.monthBtnActiveText,
                ]}
              >
                This Month
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMonth(shiftMonth(month, 1))}
              style={({ pressed }) => [
                styles.monthBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.monthBtnText}>{displayMonth(shiftMonth(month, 1))}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text} />
            </Pressable>
          </View>

          {/* Big summary card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>LEFT TO SAVE</Text>
            <Text
              style={[
                styles.summaryValue,
                summary.projected_savings < 0 && { color: colors.negative },
              ]}
            >
              {formatPrice(summary.projected_savings)}
            </Text>
            <Text style={styles.summaryHint}>
              Income {formatPrice(summary.income)} − Spent {formatPrice(summary.total_spent)}
              {summary.savings_target > 0
                ? ` · Target ${formatPrice(summary.savings_target)}`
                : ''}
            </Text>

            <View style={styles.subGrid}>
              <SubStat
                label="Income actual"
                value={summary.total_income_actual}
                positive
              />
              <SubStat
                label="Fixed bills"
                value={summary.total_fixed_planned}
              />
              <SubStat
                label="Room to budget"
                value={summary.remaining_to_budget}
                warn={summary.remaining_to_budget < 0}
              />
            </View>
            {summary.transfers_excluded > 0 ? (
              <Text style={styles.transferNote}>
                Excluded {formatPrice(summary.transfers_excluded)} of credit-card payments
                and transfers — those aren't real spending.
              </Text>
            ) : null}
          </View>

          {/* Fixed expenses (from Bills) */}
          {actuals.fixed_expenses.length > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>FIXED EXPENSES</Text>
                <Text style={styles.sectionSubtitle}>
                  {formatPrice(summary.total_fixed_spent)} of {formatPrice(summary.total_fixed_planned)}
                </Text>
              </View>
              <View style={styles.categoriesList}>
                {actuals.fixed_expenses.map((fx) => {
                  const pct =
                    fx.monthly_equivalent > 0
                      ? fx.spent_this_month / fx.monthly_equivalent
                      : 0;
                  const clamped = Math.max(0, Math.min(1, pct));
                  const barColor =
                    pct > 1
                      ? colors.negative
                      : fx.spent_this_month > 0
                        ? colors.positive
                        : colors.textMuted;
                  return (
                    <View key={fx.id} style={styles.fixedRow}>
                      <View style={styles.fixedHeader}>
                        <Text style={styles.fixedName} numberOfLines={1}>
                          {fx.name}
                        </Text>
                        <Text style={styles.fixedCadence}>{fx.cadence}</Text>
                      </View>
                      <View style={styles.fixedAmounts}>
                        <Text style={styles.fixedSpent}>
                          {formatPrice(fx.spent_this_month)}
                        </Text>
                        <Text style={styles.fixedLimit}>
                          of {formatPrice(fx.monthly_equivalent)}/mo
                        </Text>
                        <View style={{ flex: 1 }} />
                        <Text style={[styles.fixedPct, { color: barColor }]}>
                          {fx.spent_this_month > 0 ? '✓' : 'not yet'}
                        </Text>
                      </View>
                      <View style={styles.barBg}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              width: `${clamped * 100}%`,
                              backgroundColor: barColor,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Income / savings target inputs */}
          <View style={styles.inputRow}>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>MONTHLY INCOME</Text>
              <View style={styles.currencyInputWrap}>
                <Text style={styles.currencyPrefix}>$</Text>
                <TextInput
                  value={incomeDraft}
                  onChangeText={setIncomeDraft}
                  onBlur={commitIncome}
                  onSubmitEditing={commitIncome}
                  placeholder="0"
                  placeholderTextColor={colors.textDim}
                  keyboardType="decimal-pad"
                  style={styles.currencyInput}
                />
              </View>
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>SAVINGS TARGET</Text>
              <View style={styles.currencyInputWrap}>
                <Text style={styles.currencyPrefix}>$</Text>
                <TextInput
                  value={savingsDraft}
                  onChangeText={setSavingsDraft}
                  onBlur={commitSavings}
                  onSubmitEditing={commitSavings}
                  placeholder="0"
                  placeholderTextColor={colors.textDim}
                  keyboardType="decimal-pad"
                  style={styles.currencyInput}
                />
              </View>
            </View>
          </View>

          {/* Variable categories (user-defined) */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>VARIABLE CATEGORIES</Text>
            <Pressable
              onPress={() => {
                setEditing(null);
                setAddOpen(true);
              }}
              style={({ pressed }) => [
                styles.addCategoryBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="add" size={14} color={colors.accent} />
              <Text style={styles.addCategoryText}>Add category</Text>
            </Pressable>
          </View>

          {categories.length === 0 ? (
            <View style={styles.emptyCategoriesCard}>
              <Ionicons name="pie-chart-outline" size={24} color={colors.textMuted} />
              <Text style={styles.emptyCategoriesTitle}>No categories yet</Text>
              <Text style={styles.emptyCategoriesDesc}>
                Add categories like "Groceries", "Gas", "Restaurants" with monthly limits and
                merchant patterns. Your synced transactions will be matched to categories
                automatically.
              </Text>
            </View>
          ) : (
            <View style={styles.categoriesList}>
              {categories.map((cat) => (
                <BudgetCategoryRow
                  key={cat.id}
                  category={cat}
                  spent={actuals.by_category[cat.id] ?? 0}
                  onEdit={() => {
                    setEditing(cat);
                    setAddOpen(true);
                  }}
                  onDelete={() => handleDelete(cat)}
                />
              ))}
            </View>
          )}

          {/* Uncategorized bucket */}
          {actuals.uncategorized_spent > 0 ? (
            <View style={styles.uncategorizedCard}>
              <View style={styles.uncategorizedIcon}>
                <Ionicons name="help-outline" size={16} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.uncategorizedTitle}>Uncategorized spending</Text>
                <Text style={styles.uncategorizedDesc}>
                  {formatPrice(actuals.uncategorized_spent)} this month didn't match any
                  category. Add match patterns to your categories (e.g. "walgreens" or
                  "AMZN%") to bucket them.
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      <AddBudgetCategoryModal
        visible={addOpen}
        editing={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSubmit={async (input) => {
          if (editing) {
            await updateCategoryMutation.mutateAsync({
              id: editing.id,
              patch: input,
            });
          } else {
            await addCategoryMutation.mutateAsync(input);
          }
        }}
      />
    </SafeAreaView>
  );
}

function SubStat({
  label,
  value,
  positive,
  warn,
}: {
  label: string;
  value: number;
  positive?: boolean;
  warn?: boolean;
}) {
  const color = warn ? colors.negative : positive ? colors.positive : colors.text;
  return (
    <View style={styles.subStat}>
      <Text style={styles.subStatLabel}>{label}</Text>
      <Text style={[styles.subStatValue, { color }]}>
        {value < 0 ? '−' : ''}
        {formatPrice(Math.abs(value))}
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

  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },

  monthRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  monthBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  monthBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  monthBtnText: {
    ...type.micro,
    color: colors.text,
    fontWeight: '600',
    fontSize: 11,
  },
  monthBtnActiveText: { color: colors.bg },

  summaryCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  summaryLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  summaryValue: {
    ...type.display,
    color: colors.text,
    fontSize: 36,
    fontVariant: ['tabular-nums' as const],
  },
  summaryHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  subGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  subStat: { flex: 1, gap: 2 },
  subStatLabel: { ...type.micro, color: colors.textDim, letterSpacing: 0.4 },
  subStatValue: {
    ...type.heading,
    fontVariant: ['tabular-nums' as const],
    fontSize: 14,
  },

  inputRow: { flexDirection: 'row', gap: spacing.md },
  inputBlock: { flex: 1, gap: 4 },
  inputLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.5 },
  currencyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
  },
  currencyPrefix: { ...type.body, color: colors.textMuted, fontSize: 15 },
  currencyInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 4,
    fontSize: 15,
    fontVariant: ['tabular-nums' as const],
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...type.micro,
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  addCategoryBtn: {
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
  addCategoryText: { ...type.micro, color: colors.accent, fontWeight: '700' },

  emptyCategoriesCard: {
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyCategoriesTitle: { ...type.heading, color: colors.text },
  emptyCategoriesDesc: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  categoriesList: { gap: spacing.sm },

  uncategorizedCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 159, 10, 0.08)',
    borderColor: 'rgba(255, 159, 10, 0.25)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  uncategorizedIcon: { width: 28, alignItems: 'center', paddingTop: 1 },
  uncategorizedTitle: { ...type.heading, color: colors.text, fontSize: 14 },
  uncategorizedDesc: {
    ...type.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
  transferNote: {
    ...type.micro,
    color: colors.textDim,
    marginTop: spacing.sm,
    fontStyle: 'italic',
    fontSize: 10,
  },
  sectionSubtitle: {
    ...type.micro,
    color: colors.textMuted,
    fontVariant: ['tabular-nums' as const],
    letterSpacing: 0.4,
  },
  fixedRow: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs + 2,
  },
  fixedHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fixedName: { ...type.heading, color: colors.text, fontSize: 14, flex: 1 },
  fixedCadence: {
    ...type.micro,
    color: colors.textDim,
    letterSpacing: 0.4,
    fontSize: 10,
  },
  fixedAmounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  fixedSpent: {
    ...type.heading,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
    fontSize: 15,
  },
  fixedLimit: {
    ...type.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums' as const],
  },
  fixedPct: {
    ...type.micro,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  barBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
});
