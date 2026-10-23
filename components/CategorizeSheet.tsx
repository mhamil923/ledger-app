import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, type BankTransaction, type Category } from '../lib/api';
import { colors, spacing, type } from '../theme/colors';
import { formatMoney } from './BudgetCategoryRow';
import { Sheet, sheetStyles as s } from './Sheet';

// Payment apps and generic payees cover many different people/merchants, so a
// "Zelle → Gifts" rule would misfile every other Zelle. Default to no rule.
const GENERIC_PAYEE = /\b(zelle|venmo|paypal|cash ?app|square|sq \*|check|atm|withdrawal|deposit|transfer|apple cash|amazon)\b/i;

export function isGenericPayee(txn: BankTransaction): boolean {
  return GENERIC_PAYEE.test(txn.merchant ?? txn.description);
}

interface Props {
  txn: BankTransaction | null;
  categories: Category[];
  onClose: () => void;
  onSaved: (message: string | null) => void;
}

/**
 * Pick a category for a transaction. With "always" on, a rule is created so
 * this payee is filed the same way from now on (and past transactions that
 * weren't set by hand are re-filed too).
 */
export function CategorizeSheet({ txn, categories, onClose, onSaved }: Props) {
  const [always, setAlways] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAlways(txn ? !isGenericPayee(txn) : true);
    setError(null);
    setBusy(null);
  }, [txn]);

  const grouped = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      if (c.hidden) continue;
      const list = map.get(c.group_name) ?? [];
      list.push(c);
      map.set(c.group_name, list);
    }
    return [...map.entries()];
  }, [categories]);

  if (!txn) return null;
  const payee = txn.merchant ?? txn.description;

  const save = async (key: string, input: Parameters<typeof apiClient.updateTransaction>[1]): Promise<void> => {
    setBusy(key);
    setError(null);
    try {
      const res = await apiClient.updateTransaction(txn.id, input);
      const moved = res.processed?.changed ?? 0;
      onSaved(
        res.rule
          ? `Rule saved: "${res.rule.value}" → ${res.transaction.category_name ?? 'category'}${moved > 0 ? ` (${moved} other transaction${moved === 1 ? '' : 's'} updated)` : ''}`
          : null,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet visible={!!txn} onClose={onClose} eyebrow="CATEGORIZE" title={payee}>
      <View style={{ gap: 2 }}>
        <Text style={{ ...type.heading, color: txn.amount < 0 ? colors.text : colors.positive, fontVariant: ['tabular-nums'] }}>
          {txn.amount < 0 ? '' : '+'}
          {formatMoney(txn.amount)}
        </Text>
        <Text style={s.hint}>
          {new Date(txn.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {txn.account_name ? ` · ${txn.account_name}` : ''}
          {txn.description !== payee ? ` · ${txn.description}` : ''}
        </Text>
        {txn.category_source === 'ai' ? (
          <Text style={s.hint}>Claude filed this under {txn.category_name}. Pick a category to correct it.</Text>
        ) : null}
      </View>

      <View style={s.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.toggleTitle}>Always file "{payee}" here</Text>
          <Text style={s.toggleDesc}>
            {isGenericPayee(txn)
              ? `Off by default: "${payee}" is used for many different payees, so one rule would misfile the others.`
              : 'Creates a rule for future and past transactions from this payee.'}
          </Text>
        </View>
        <Switch value={always} onValueChange={setAlways} trackColor={{ true: colors.accent, false: colors.border }} />
      </View>

      {grouped.map(([group, list]) => (
        <View key={group} style={s.field}>
          <Text style={s.label}>{group.toUpperCase()}</Text>
          <View style={s.chipRow}>
            {list.map((c) => {
              const active = c.id === txn.category_id;
              return (
                <Pressable
                  key={c.id}
                  disabled={!!busy}
                  onPress={() => void save(c.id, { category_id: c.id, make_rule: always })}
                  style={[s.chip, active && s.chipActive]}
                >
                  {busy === c.id ? (
                    <ActivityIndicator size="small" color={active ? colors.bg : colors.accent} />
                  ) : (
                    <Text style={[s.chipText, active && s.chipTextActive]}>{c.name}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {error ? (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.negative} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          disabled={!!busy}
          onPress={() => void save('transfer', { is_transfer: !txn.is_transfer })}
          style={[s.secondaryBtn, { flex: 1 }]}
        >
          <Ionicons name="swap-horizontal" size={16} color={colors.text} />
          <Text style={s.secondaryText}>{txn.is_transfer ? 'Not a transfer' : 'Mark as transfer'}</Text>
        </Pressable>
        {txn.category_id ? (
          <Pressable disabled={!!busy} onPress={() => void save('clear', { category_id: null })} style={[s.secondaryBtn, { flex: 1 }]}>
            <Ionicons name="close-circle-outline" size={16} color={colors.text} />
            <Text style={s.secondaryText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={s.hint}>
        Transfers are money moving between your own accounts (card payments, savings). They never count as spending or income.
      </Text>
    </Sheet>
  );
}
