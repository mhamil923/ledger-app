import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, type EnvelopeBudget, type EnvelopeCategory } from '../lib/api';
import { colors, spacing } from '../theme/colors';
import { formatMoney } from './BudgetCategoryRow';
import { Sheet, sheetStyles as s } from './Sheet';

interface Props {
  category: EnvelopeCategory | null;
  budget: EnvelopeBudget;
  onClose: () => void;
  onChanged: (next: EnvelopeBudget) => void;
  onViewTransactions: (category: EnvelopeCategory) => void;
  onEdit: (category: EnvelopeCategory) => void;
}

const TO_BUDGET = '__to_budget__';

/**
 * Tap a category: set its budget, cover overspending, or move money to/from
 * another category or To Budget (Actual's "Transfer to another category").
 */
export function CategoryActionsSheet({ category, budget, onClose, onChanged, onViewTransactions, onEdit }: Props) {
  const [amount, setAmount] = useState('');
  const [moveAmount, setMoveAmount] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [other, setOther] = useState<string>(TO_BUDGET);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!category) return;
    setAmount(String(category.budgeted || ''));
    setMoveAmount(category.balance < 0 ? String(Math.abs(category.balance)) : '');
    setDirection(category.balance < 0 ? 'in' : 'out');
    setOther(TO_BUDGET);
    setError(null);
  }, [category]);

  if (!category) return null;
  const others = budget.groups.flatMap((g) => g.categories).filter((c) => c.id !== category.id);

  const run = async (fn: () => Promise<EnvelopeBudget>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const saveBudgeted = (value: number): void => {
    if (!Number.isFinite(value)) {
      setError('Enter a valid amount.');
      return;
    }
    void run(() => apiClient.setBudgeted(budget.month, category.id, value));
  };

  const move = (): void => {
    const n = Number(moveAmount);
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter an amount to move.');
      return;
    }
    const otherId = other === TO_BUDGET ? null : other;
    const input =
      direction === 'out'
        ? { from_category_id: category.id, to_category_id: otherId, amount: n }
        : { from_category_id: otherId, to_category_id: category.id, amount: n };
    void run(() => apiClient.moveMoney(budget.month, input));
  };

  return (
    <Sheet visible={!!category} onClose={onClose} eyebrow={category.group_name.toUpperCase()} title={category.name}>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Stat label="Left to spend" value={category.balance} highlight />
        <Stat label="Spent" value={-category.activity} />
        <Stat label="Left from last month" value={category.carryover} />
      </View>

      <View style={s.field}>
        <Text style={s.label}>PLANNED FOR {monthLabel(budget.month).toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={[s.currencyWrap, { flex: 1 }]}>
            <Text style={s.currencyPrefix}>$</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textDim}
              style={s.currencyInput}
              onSubmitEditing={() => saveBudgeted(Number(amount || 0))}
            />
          </View>
          <Pressable onPress={() => saveBudgeted(Number(amount || 0))} disabled={busy} style={[s.primaryBtn, { paddingHorizontal: spacing.lg }]}>
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.primaryText}>Save</Text>}
          </Pressable>
        </View>
        <View style={[s.chipRow, { marginTop: 6 }]}>
          {category.balance < 0 ? (
            <Pressable style={s.chip} onPress={() => saveBudgeted(category.budgeted - category.balance)}>
              <Text style={s.chipText}>Cover overspending ({formatMoney(-category.balance)})</Text>
            </Pressable>
          ) : null}
          {category.bill ? (
            <Pressable style={s.chip} onPress={() => saveBudgeted(Math.round(category.bill!.monthly_equivalent * (1 - category.bill!.shared_share) * 100) / 100)}>
              <Text style={s.chipText}>
                {category.bill.shared_share > 0 ? 'Your share of the bill' : 'Bill amount'} (
                {formatMoney(category.bill.monthly_equivalent * (1 - category.bill.shared_share))}/mo)
              </Text>
            </Pressable>
          ) : null}
          {category.activity < 0 ? (
            <Pressable style={s.chip} onPress={() => saveBudgeted(-category.activity)}>
              <Text style={s.chipText}>Match spending ({formatMoney(-category.activity)})</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {category.bill ? <SplitBill category={category} onSaved={() => void run(() => apiClient.getBudget(budget.month))} /> : null}

      <View style={s.field}>
        <Text style={s.label}>MOVE MONEY BETWEEN CATEGORIES</Text>
        <View style={s.chipRow}>
          {(['out', 'in'] as const).map((d) => (
            <Pressable key={d} onPress={() => setDirection(d)} style={[s.chip, direction === d && s.chipActive]}>
              <Text style={[s.chipText, direction === d && s.chipTextActive]}>
                {d === 'out' ? 'Move out to…' : 'Pull in from…'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={[s.currencyWrap, { marginTop: 6 }]}>
          <Text style={s.currencyPrefix}>$</Text>
          <TextInput
            value={moveAmount}
            onChangeText={setMoveAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textDim}
            style={s.currencyInput}
          />
        </View>
        <View style={[s.chipRow, { marginTop: 6 }]}>
          <Pressable onPress={() => setOther(TO_BUDGET)} style={[s.chip, other === TO_BUDGET && s.chipActive]}>
            <Text style={[s.chipText, other === TO_BUDGET && s.chipTextActive]}>Unassigned money ({formatMoney(budget.to_budget)})</Text>
          </Pressable>
          {others.map((c) => (
            <Pressable key={c.id} onPress={() => setOther(c.id)} style={[s.chip, other === c.id && s.chipActive]}>
              <Text style={[s.chipText, other === c.id && s.chipTextActive]}>
                {c.name} ({formatMoney(c.balance)})
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={move} disabled={busy} style={[s.secondaryBtn, { marginTop: 6 }]}>
          <Ionicons name="swap-horizontal" size={16} color={colors.text} />
          <Text style={s.secondaryText}>Move</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.negative} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable onPress={() => onViewTransactions(category)} style={[s.secondaryBtn, { flex: 1 }]}>
          <Ionicons name="list-outline" size={16} color={colors.text} />
          <Text style={s.secondaryText}>Transactions</Text>
        </Pressable>
        <Pressable onPress={() => onEdit(category)} style={[s.secondaryBtn, { flex: 1 }]}>
          <Ionicons name="create-outline" size={16} color={colors.text} />
          <Text style={s.secondaryText}>Edit</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  const color = highlight ? (value < 0 ? colors.negative : value > 0 ? colors.positive : colors.textMuted) : colors.text;
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <Text style={{ color, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatMoney(value)}</Text>
    </View>
  );
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}

/** "Someone pays me back part of this bill" — e.g. splitting rent. */
function SplitBill({ category, onSaved }: { category: EnvelopeCategory; onSaved: () => void }) {
  const bill = category.bill!;
  const [share, setShare] = useState(bill.shared_share);
  const [who, setWho] = useState(bill.shared_with ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setShare(bill.shared_share);
    setWho(bill.shared_with ?? '');
  }, [bill.shared_share, bill.shared_with]);
  const dirty = Math.abs(share - bill.shared_share) > 0.001 || (who || null) !== (bill.shared_with || null);
  const save = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      await apiClient.updateBill(bill.id, { shared_share: share, shared_with: who.trim() || null });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.field}>
      <Text style={s.label}>SPLIT THIS BILL</Text>
      <Text style={s.hint}>If someone pays you back part of this bill, the budget plans only your part and their payment counts against it.</Text>
      <View style={[s.chipRow, { marginTop: 6 }]}>
        {[0, 0.5, 1 / 3, 0.25].map((v) => (
          <Pressable key={v} style={[s.chip, Math.abs(share - v) < 0.001 && { borderColor: colors.accent }]} onPress={() => setShare(v)}>
            <Text style={[s.chipText, Math.abs(share - v) < 0.001 && { color: colors.accent }]}>
              {v === 0 ? 'Not split' : `They pay ${Math.round(v * 100)}%`}
            </Text>
          </Pressable>
        ))}
      </View>
      {share > 0 ? (
        <>
          <TextInput value={who} onChangeText={setWho} placeholder="Who? (e.g. Madeline)" placeholderTextColor={colors.textDim} style={[s.input, { marginTop: 6 }]} />
          <Text style={s.hint}>
            You pay {formatMoney(bill.amount * (1 - share))} of {formatMoney(bill.amount)}; {who || 'they'} cover{who ? 's' : ''} {formatMoney(bill.amount * share)}.
          </Text>
        </>
      ) : null}
      {err ? <Text style={[s.hint, { color: colors.negative }]}>{err}</Text> : null}
      {dirty ? (
        <Pressable onPress={() => void save()} style={[s.primaryBtn, { marginTop: 6 }]}>
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.primaryText}>Save split</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}
