import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AddBudgetCategoryModal } from '../../components/AddBudgetCategoryModal';
import { BudgetCategoryRow, BudgetColumnsHeader, formatMoney, money } from '../../components/BudgetCategoryRow';
import { CategoryActionsSheet } from '../../components/CategoryActionsSheet';
import { Sheet, sheetStyles } from '../../components/Sheet';
import { apiClient, type EnvelopeBudget, type EnvelopeCategory } from '../../lib/api';
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

function displayMonth(month: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

export default function BudgetScreen() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<EnvelopeCategory | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EnvelopeCategory | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showUnused, setShowUnused] = useState(false);
  const [showHow, setShowHow] = useState(false);

  const budgetQuery = useQuery<EnvelopeBudget>({
    queryKey: ['budget', month],
    queryFn: () => apiClient.getBudget(month),
  });
  const refetchBudget = budgetQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchBudget();
    }, [refetchBudget]),
  );

  const applyBudget = (next: EnvelopeBudget): void => {
    queryClient.setQueryData(['budget', next.month], next);
    // Later months depend on this one (rollover), so drop them from cache.
    void queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'budget' && String(q.queryKey[1]) > next.month,
    });
    void queryClient.invalidateQueries({ queryKey: ['overview'] });
  };
  const refreshAll = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['budget'] });
    void queryClient.invalidateQueries({ queryKey: ['overview'] });
  };

  const copyMutation = useMutation({
    mutationFn: () => apiClient.copyLastMonth(month),
    onSuccess: applyBudget,
  });
  const fundBillsMutation = useMutation({
    mutationFn: () => apiClient.fundBills(month),
    onSuccess: applyBudget,
  });
  const startHereMutation = useMutation({
    mutationFn: () => apiClient.updateBudgetSettings({ start_month: month }),
    onSuccess: refreshAll,
  });

  const data = budgetQuery.data;
  const allGroups = data?.groups.map((g) => g.name) ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        eyebrow="BUDGET"
        title="Budget"
        subtitle={displayMonth(month)}
        actions={[
          { icon: 'options-outline', onPress: () => setSettingsOpen(true), accessibilityLabel: 'Budget settings' },
          {
            icon: 'add',
            onPress: () => {
              setEditing(null);
              setEditorOpen(true);
            },
            accessibilityLabel: 'Add category',
          },
        ]}
      />

      {budgetQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : budgetQuery.isError || !data ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Couldn't load budget</Text>
          <Text style={styles.emptyDesc}>
            {budgetQuery.error instanceof Error ? budgetQuery.error.message : 'Unknown error'}
          </Text>
          <Pressable onPress={() => void budgetQuery.refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
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
          <View style={styles.monthRow}>
            <MonthBtn label={displayMonth(shiftMonth(month, -1), { month: 'short' })} icon="chevron-back" onPress={() => setMonth(shiftMonth(month, -1))} />
            <MonthBtn label="This Month" active={month === currentMonth()} onPress={() => setMonth(currentMonth())} />
            <MonthBtn label={displayMonth(shiftMonth(month, 1), { month: 'short' })} iconRight="chevron-forward" onPress={() => setMonth(shiftMonth(month, 1))} />
          </View>

          {data.before_start ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Before your budget starts</Text>
              <Text style={styles.noticeDesc}>
                Your envelopes start in {displayMonth(data.start_month)}. Start here instead to include this month's income and spending.
              </Text>
              <Pressable onPress={() => startHereMutation.mutate()} style={styles.smallBtn}>
                <Text style={styles.smallBtnText}>Start budget in {displayMonth(month, { month: 'long' })}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <GlanceCard data={data} isCurrent={month === currentMonth()} />
              <UnassignedCard data={data} isCurrent={month === currentMonth()} />
            </>
          )}

          {data.autofilled ? (
            <Text style={styles.autofillNote}>This month's plan was copied from last month. Tap any category to change it.</Text>
          ) : null}

          <View style={styles.actionRow}>
            <ActionChip icon="copy-outline" label="Use last month's plan" busy={copyMutation.isPending} onPress={() => copyMutation.mutate()} />
            <ActionChip icon="receipt-outline" label="Fill in bill amounts" busy={fundBillsMutation.isPending} onPress={() => fundBillsMutation.mutate()} />
          </View>

          {data.summary.uncategorized_count > 0 ? (
            <Pressable
              onPress={() => router.push({ pathname: '/(tabs)/spending', params: { filter: 'uncategorized', month } })}
              style={({ pressed }) => [styles.uncatCard, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="help-circle-outline" size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.uncatTitle}>
                  {data.summary.uncategorized_count} uncategorized · {formatMoney(data.summary.uncategorized_spent)}
                </Text>
                <Text style={styles.uncatDesc}>
                  Money you spent that isn't in any category yet. Tap to sort it so the numbers below are complete.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}

          {data.groups.map((g) => {
            const used = g.categories.filter(isUsed);
            if (!used.length) return null;
            const spent = used.reduce((t, c) => t + Math.max(0, -c.activity), 0);
            return (
              <View key={g.name} style={{ gap: spacing.sm }}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{g.name.toUpperCase()}</Text>
                  <Text style={styles.groupTotals}>
                    {money(g.budgeted)} planned · {money(spent)} spent · {money(g.balance)} left
                  </Text>
                </View>
                <BudgetColumnsHeader />
                {used.map((c) => (
                  <BudgetCategoryRow key={c.id} category={c} onPress={() => setSelected(c)} />
                ))}
              </View>
            );
          })}

          {(() => {
            const unused = data.groups.flatMap((g) => g.categories.filter((c) => !isUsed(c)));
            if (!unused.length) return null;
            return (
              <View style={{ gap: spacing.sm }}>
                <Pressable onPress={() => setShowUnused(!showUnused)} style={styles.unusedToggle}>
                  <Ionicons name={showUnused ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textMuted} />
                  <Text style={styles.unusedText}>
                    {unused.length} categor{unused.length === 1 ? 'y' : 'ies'} with nothing planned or spent this month
                  </Text>
                </Pressable>
                {showUnused ? (
                  <>
                    <BudgetColumnsHeader />
                    {unused.map((c) => (
                      <BudgetCategoryRow key={c.id} category={c} onPress={() => setSelected(c)} />
                    ))}
                  </>
                ) : null}
              </View>
            );
          })()}

          {data.groups.length === 0 ? (
            <View style={styles.emptyCategoriesCard}>
              <Ionicons name="wallet-outline" size={24} color={colors.textMuted} />
              <Text style={styles.emptyCategoriesTitle}>No envelopes yet</Text>
              <Text style={styles.emptyCategoriesDesc}>
                Add categories like Groceries, Gas and Restaurants, then give each one part of your To Budget money.
              </Text>
            </View>
          ) : null}

          <View style={styles.groupHeader}>
            <Text style={styles.groupTitle}>MONEY IN THIS MONTH</Text>
            <Text style={styles.groupTotals}>{money(data.summary.income)} received</Text>
          </View>
          {data.income_categories.map((c) => (
            <View key={c.id} style={styles.incomeRow}>
              <Text style={styles.incomeName}>{c.name}</Text>
              <Text style={styles.incomeValue}>{money(c.activity)}</Text>
            </View>
          ))}
          {data.income_categories.length === 0 ? <Text style={styles.footNote}>No paychecks or other income have landed yet this month.</Text> : null}
          {data.summary.transfers_excluded > 0 ? (
            <Text style={styles.footNote}>
              {money(data.summary.transfers_excluded)} of credit card payments and transfers between your own accounts isn't counted as income or spending — it's just money moving between your pockets.
            </Text>
          ) : null}

          <Pressable onPress={() => setShowHow(!showHow)} style={styles.unusedToggle}>
            <Ionicons name={showHow ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.accent} />
            <Text style={[styles.unusedText, { color: colors.accent }]}>How this budget works</Text>
          </Pressable>
          {showHow ? (
            <View style={styles.noticeCard}>
              <Text style={styles.howText}>
                <Text style={styles.howStrong}>Planned</Text> is how much you decided to spend in a category this month. Tap a category
                to change it.{'\n\n'}
                <Text style={styles.howStrong}>Spent</Text> is what actually left your bank and cards for that category this month.{'\n\n'}
                <Text style={styles.howStrong}>Left</Text> is what you can still spend. Anything you don't spend rolls into next month
                for the same category, so saving up works automatically. Red means you went over.{'\n\n'}
                <Text style={styles.howStrong}>Yearly bills</Text> (PlayStation, annual fees) get a small amount each month so the full
                bill is already saved when it's due — the row shows how much you've saved so far.{'\n\n'}
                <Text style={styles.howStrong}>Unassigned money</Text> is cash you have that isn't in your plan yet. The goal is to get it
                to $0 by giving every dollar a category (including Savings or Investing).
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {data ? (
        <CategoryActionsSheet
          category={selected}
          budget={data}
          onClose={() => setSelected(null)}
          onChanged={applyBudget}
          onViewTransactions={(c) => {
            setSelected(null);
            router.push({ pathname: '/(tabs)/spending', params: { category_id: c.id, category_name: c.name, month } });
          }}
          onEdit={(c) => {
            setSelected(null);
            setEditing(c);
            setEditorOpen(true);
          }}
        />
      ) : null}

      <AddBudgetCategoryModal
        visible={editorOpen}
        editing={editing}
        groups={allGroups}
        month={month}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSaved={refreshAll}
      />

      <BudgetSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={refreshAll} />
    </SafeAreaView>
  );
}

function isUsed(c: EnvelopeCategory): boolean {
  return Math.abs(c.budgeted) >= 0.005 || Math.abs(c.activity) >= 0.005 || Math.abs(c.balance) >= 0.005;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m!, 0).getDate();
}

/** The four numbers that answer "how's my month going?" */
const SAVINGS_GROUP = /saving|invest/i;

function GlanceCard({ data, isCurrent }: { data: EnvelopeBudget; isCurrent: boolean }) {
  const s = data.summary;
  // Savings & investing aren't spending money — show them separately.
  const spendGroups = data.groups.filter((g) => !SAVINGS_GROUP.test(g.name));
  const saveGroups = data.groups.filter((g) => SAVINGS_GROUP.test(g.name));
  const left = spendGroups.reduce((t, g) => t + g.balance, 0);
  const planned = spendGroups.reduce((t, g) => t + g.budgeted, 0);
  const spent = spendGroups.reduce((t, g) => t + g.categories.reduce((u, c) => u + Math.max(0, -c.activity), 0), 0);
  const saving = saveGroups.reduce((t, g) => t + g.budgeted, 0);
  const saved = saveGroups.reduce((t, g) => t + g.balance, 0);
  const usedPct = planned > 0 ? Math.min(1, spent / planned) : 0;
  const total = daysInMonth(data.month);
  const day = isCurrent ? new Date().getDate() : total;
  const monthPct = day / total;
  const daysLeft = total - day;
  let pace: string;
  if (!isCurrent) pace = data.month < currentMonth() ? `Month is over — you spent ${Math.round(usedPct * 100)}% of your spending plan.` : "This month hasn't started yet.";
  else if (planned <= 0) pace = 'No plan yet — tap a category to set how much you want to spend.';
  else if (usedPct <= monthPct + 0.05) pace = `On track: ${Math.round(usedPct * 100)}% of your spending plan used with ${Math.round(monthPct * 100)}% of the month gone.`;
  else pace = `Spending faster than planned: ${Math.round(usedPct * 100)}% used with ${Math.round(monthPct * 100)}% of the month gone.`;
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{isCurrent ? `THIS MONTH · ${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT` : 'MONTH SUMMARY'}</Text>
      <View style={styles.glanceGrid}>
        <Glance label="Money in" value={s.income} color={colors.positive} hint="paychecks & other income" />
        <Glance label="Spending plan" value={planned} hint="bills + everyday" />
        <Glance label="Spent" value={spent} hint="so far this month" />
        <Glance label="Left to spend" value={left} color={left < 0 ? colors.negative : colors.text} hint="before you go over" />
      </View>
      <View style={styles.paceBar}>
        <View style={[styles.paceFill, { width: `${usedPct * 100}%`, backgroundColor: usedPct > monthPct + 0.05 ? colors.warning : colors.accent }]} />
        {isCurrent ? <View style={[styles.paceMarker, { left: `${monthPct * 100}%` }]} /> : null}
      </View>
      <Text style={styles.summaryHint}>{pace}</Text>
      {saveGroups.length ? (
        <Text style={styles.savingLine}>
          Savings & investing: {money(saving)} set aside this month · {money(saved)} saved in total
        </Text>
      ) : null}
    </View>
  );
}

function Glance({ label, value, color, hint }: { label: string; value: number; color?: string; hint: string }) {
  return (
    <View style={styles.glance}>
      <Text style={styles.subStatLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.glanceValue, { color: color ?? colors.text }]}>{money(value)}</Text>
      <Text style={styles.glanceHint}>{hint}</Text>
    </View>
  );
}

/** "To Budget", in plain words. */
function UnassignedCard({ data, isCurrent }: { data: EnvelopeBudget; isCurrent: boolean }) {
  const [math, setMath] = useState(false);
  const s = data.summary;
  const tb = data.to_budget;
  const have = s.carried_in + s.income;
  const over = tb < -0.004;
  const extra = tb > 0.004;
  const color = over ? colors.negative : extra ? colors.positive : colors.textMuted;
  return (
    <View style={[styles.noticeCard, over && { borderColor: 'rgba(239, 68, 68, 0.35)' }]}>
      <View style={styles.unassignedTop}>
        <Ionicons name={over ? 'alert-circle' : extra ? 'add-circle' : 'checkmark-circle'} size={20} color={color} />
        <View style={{ flex: 1 }}>
          <Text style={styles.noticeTitle}>
            {over
              ? `Your plan is ${money(-tb)} more than the money you have`
              : extra
                ? `${money(tb)} isn't in your plan yet`
                : 'Every dollar is in your plan ✓'}
          </Text>
          <Text style={styles.noticeDesc}>
            {over
              ? s.income < 1 && isCurrent
                ? "No paychecks have landed this month yet, so this is normal early in the month — it fills in as you get paid. If it's still negative after payday, lower a few planned amounts."
                : 'Lower some planned amounts (tap a category) until this reaches $0, so you only plan money you actually have.'
              : extra
                ? 'Give it a job: add it to a category like Savings, Investing, or a bill you want to get ahead on.'
                : 'Nice — all your money has a purpose.'}
          </Text>
        </View>
      </View>
      <Pressable onPress={() => setMath(!math)} style={styles.unusedToggle}>
        <Ionicons name={math ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.textDim} />
        <Text style={styles.mathToggle}>Show the math</Text>
      </Pressable>
      {math ? (
        <View style={{ gap: 4 }}>
          <MathLine label="Unspent money from before this month" value={s.carried_in} />
          <MathLine label="+ Money in this month" value={s.income} />
          <MathLine label="= Money you have to plan with" value={have} strong />
          <MathLine label="− Planned this month" value={-s.budgeted} />
          {s.overspent_last_month > 0 ? <MathLine label="− Overspending last month" value={-s.overspent_last_month} /> : null}
          {s.uncategorized_spent > 0 ? <MathLine label="− Spending not in a category yet" value={-s.uncategorized_spent} /> : null}
          <MathLine label={over ? '= Over-planned by' : '= Not in your plan yet'} value={tb} strong color={color} />
        </View>
      ) : null}
    </View>
  );
}

function MathLine({ label, value, strong, color }: { label: string; value: number; strong?: boolean; color?: string }) {
  return (
    <View style={styles.mathLine}>
      <Text style={[styles.mathLabel, strong && { color: colors.text, fontWeight: '600' }]}>{label}</Text>
      <Text style={[styles.mathValue, strong && { fontWeight: '700' }, color ? { color } : null]}>{formatMoney(value)}</Text>
    </View>
  );
}

function BudgetSettingsSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const q = useQuery({ queryKey: ['budget-settings'], queryFn: apiClient.getBudgetSettings, enabled: visible });
  const [funds, setFunds] = useState('');
  const [start, setStart] = useState('');
  const [error, setError] = useState<string | null>(null);
  const settings = q.data?.settings;
  const save = useMutation({
    mutationFn: () => {
      const n = funds.trim() === '' ? undefined : Number(funds);
      if (n != null && !Number.isFinite(n)) throw new Error('Enter a valid amount.');
      if (start && !/^\d{4}-\d{2}$/.test(start)) throw new Error('Start month must look like 2026-10.');
      return apiClient.updateBudgetSettings({ starting_funds: n, start_month: start || undefined });
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save.'),
  });
  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="BUDGET SETTINGS" title="Where your budget starts">
      <View style={sheetStyles.field}>
        <Text style={sheetStyles.label}>START MONTH</Text>
        <TextInput
          value={start}
          onChangeText={setStart}
          placeholder={settings?.start_month ?? 'YYYY-MM'}
          placeholderTextColor={colors.textDim}
          style={sheetStyles.input}
          autoCapitalize="none"
        />
        <Text style={sheetStyles.hint}>Income and spending before this month are ignored by the envelopes.</Text>
      </View>
      <View style={sheetStyles.field}>
        <Text style={sheetStyles.label}>STARTING CASH TO BUDGET</Text>
        <View style={sheetStyles.currencyWrap}>
          <Text style={sheetStyles.currencyPrefix}>$</Text>
          <TextInput
            value={funds}
            onChangeText={setFunds}
            placeholder={settings ? String(settings.starting_funds) : '0'}
            placeholderTextColor={colors.textDim}
            keyboardType="decimal-pad"
            style={sheetStyles.currencyInput}
          />
        </View>
        <Text style={sheetStyles.hint}>
          Money you already had in checking and savings on day one. It's added to To Budget in the start month, like Actual's starting balance.
        </Text>
      </View>
      {error ? (
        <View style={sheetStyles.errorBox}>
          <Text style={sheetStyles.errorText}>{error}</Text>
        </View>
      ) : null}
      <Pressable onPress={() => save.mutate()} style={sheetStyles.primaryBtn}>
        {save.isPending ? <ActivityIndicator color={colors.bg} /> : <Text style={sheetStyles.primaryText}>Save</Text>}
      </Pressable>
    </Sheet>
  );
}

function MonthBtn({
  label,
  onPress,
  active,
  icon,
  iconRight,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={active}
      style={({ pressed }) => [styles.monthBtn, active && styles.monthBtnActive, pressed && { opacity: 0.6 }]}
    >
      {icon ? <Ionicons name={icon} size={16} color={colors.text} /> : null}
      <Text style={[styles.monthBtnText, active && styles.monthBtnActiveText]}>{label}</Text>
      {iconRight ? <Ionicons name={iconRight} size={16} color={colors.text} /> : null}
    </Pressable>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [styles.actionChip, pressed && { opacity: 0.7 }]}>
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name={icon} size={14} color={colors.accent} />}
      <Text style={styles.actionChipText}>{label}</Text>
    </Pressable>
  );
}

function SubStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.subStat}>
      <Text style={styles.subStatLabel}>{label}</Text>
      <Text style={[styles.subStatValue, { color: color ?? colors.text }]}>{formatMoney(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyTitle: { ...type.title, color: colors.text, textAlign: 'center' },
  emptyDesc: { ...type.body, color: colors.textMuted, textAlign: 'center', maxWidth: 380, lineHeight: 22 },
  retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm + 2, backgroundColor: colors.accent, borderRadius: radius.md },
  retryBtnText: { ...type.heading, color: colors.bg, fontSize: 14 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md, maxWidth: 760, width: '100%', alignSelf: 'center' },

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
  monthBtnText: { ...type.micro, color: colors.text, fontWeight: '600', fontSize: 11 },
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
  summaryValue: { ...type.display, fontSize: 36, fontVariant: ['tabular-nums' as const] },
  summaryHint: { ...type.caption, color: colors.textMuted },
  formulaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, marginTop: spacing.xs },
  formula: { ...type.micro, color: colors.textDim, lineHeight: 16 },
  subGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  subStat: { flex: 1, gap: 2 },
  subStatLabel: { ...type.micro, color: colors.textDim, letterSpacing: 0.4 },
  subStatValue: { ...type.heading, fontVariant: ['tabular-nums' as const], fontSize: 14 },

  noticeCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  noticeTitle: { ...type.heading, color: colors.text },
  noticeDesc: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  smallBtn: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  smallBtnText: { ...type.caption, color: colors.bg, fontWeight: '700' },
  autofillNote: { ...type.micro, color: colors.textDim, fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: 'rgba(124, 140, 255, 0.10)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(124, 140, 255, 0.25)',
  },
  actionChipText: { ...type.micro, color: colors.accent, fontWeight: '700' },

  uncatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  uncatTitle: { ...type.heading, color: colors.text, fontSize: 14 },
  uncatDesc: { ...type.micro, color: colors.textMuted, lineHeight: 16, marginTop: 2 },

  savingLine: { ...type.caption, color: colors.textMuted, fontSize: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.sm, marginTop: spacing.xs },
  glanceGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, marginTop: spacing.sm },
  glance: { width: '50%', gap: 1 },
  glanceValue: { ...type.title, fontSize: 24, fontVariant: ['tabular-nums' as const] },
  glanceHint: { ...type.micro, color: colors.textDim, fontSize: 10 },
  paceBar: { height: 8, borderRadius: 4, backgroundColor: colors.bgElevated, marginTop: spacing.md, overflow: 'visible' },
  paceFill: { height: '100%', borderRadius: 4 },
  paceMarker: { position: 'absolute', top: -3, width: 2, height: 14, backgroundColor: colors.text, opacity: 0.6 },
  unassignedTop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  mathToggle: { ...type.micro, color: colors.textDim },
  mathLine: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  mathLabel: { ...type.caption, color: colors.textMuted, fontSize: 12, flex: 1 },
  mathValue: { ...type.caption, color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums' as const] },
  unusedToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  unusedText: { ...type.caption, color: colors.textMuted, fontSize: 12 },
  howText: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  howStrong: { color: colors.text, fontWeight: '700' },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.md, gap: spacing.sm },
  groupTitle: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  groupTotals: { ...type.micro, color: colors.textDim, fontVariant: ['tabular-nums' as const] },

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
  emptyCategoriesDesc: { ...type.caption, color: colors.textMuted, textAlign: 'center', maxWidth: 320, lineHeight: 18 },

  incomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  incomeName: { ...type.heading, color: colors.text, fontSize: 15 },
  incomeValue: { ...type.heading, color: colors.positive, fontSize: 15, fontVariant: ['tabular-nums' as const] },
  footNote: { ...type.micro, color: colors.textDim, fontStyle: 'italic', lineHeight: 15 },
});
