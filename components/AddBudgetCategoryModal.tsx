import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, type EnvelopeCategory } from '../lib/api';
import { colors } from '../theme/colors';
import { Sheet, sheetStyles as s } from './Sheet';

interface Props {
  visible: boolean;
  /** Edit mode when set. */
  editing: EnvelopeCategory | null;
  groups: string[];
  month: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Add or edit an envelope category. Categories persist across months; the
 * amount entered here is only this month's budget (it copies forward to new
 * months automatically). Match patterns become categorization rules.
 */
export function AddBudgetCategoryModal({ visible, editing, groups, month, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('Everyday');
  const [newGroup, setNewGroup] = useState('');
  const [budgeted, setBudgeted] = useState('');
  const [patterns, setPatterns] = useState('');
  const [rollover, setRollover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupChoices = [...new Set(['Bills', 'Everyday', 'Savings', ...groups])].filter((g) => g !== 'Income');

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setGroup(editing?.group_name ?? 'Everyday');
    setNewGroup('');
    setBudgeted('');
    setPatterns(editing?.match_patterns.join(', ') ?? '');
    setRollover(editing?.rollover_overspending ?? false);
    setError(null);
  }, [visible, editing]);

  const patternList = (): string[] =>
    patterns
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

  const save = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
      return;
    }
    const groupName = newGroup.trim() || group;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await apiClient.updateCategory(editing.id, {
          name: trimmed,
          group_name: groupName,
          rollover_overspending: rollover,
          match_patterns: patternList(),
        });
      } else {
        const amount = budgeted.trim() ? Number(budgeted) : undefined;
        if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
          setError('Enter a valid amount.');
          setBusy(false);
          return;
        }
        await apiClient.addCategory({
          name: trimmed,
          group_name: groupName,
          rollover_overspending: rollover,
          match_patterns: patternList(),
          budgeted: amount,
          month,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (): void => {
    if (!editing) return;
    const message = `Delete "${editing.name}"? Its transactions become uncategorized and its rules are removed. To keep the history, hide it instead.`;
    const go = async (): Promise<void> => {
      setBusy(true);
      try {
        await apiClient.deleteCategory(editing.id);
        onSaved();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete.');
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) void go();
      return;
    }
    Alert.alert('Delete category?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void go() },
    ]);
  };

  const hide = async (): Promise<void> => {
    if (!editing) return;
    setBusy(true);
    try {
      await apiClient.updateCategory(editing.id, { hidden: true });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hide.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow={editing ? 'EDIT CATEGORY' : 'NEW CATEGORY'}
      title={editing ? editing.name : 'Add category'}
    >
      <View style={s.field}>
        <Text style={s.label}>NAME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Groceries"
          placeholderTextColor={colors.textDim}
          style={s.input}
          autoCorrect={false}
        />
      </View>

      <View style={s.field}>
        <Text style={s.label}>GROUP</Text>
        <View style={s.chipRow}>
          {groupChoices.map((g) => {
            const active = !newGroup && g === group;
            return (
              <Pressable key={g} onPress={() => { setGroup(g); setNewGroup(''); }} style={[s.chip, active && s.chipActive]}>
                <Text style={[s.chipText, active && s.chipTextActive]}>{g}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={newGroup}
          onChangeText={setNewGroup}
          placeholder="…or type a new group"
          placeholderTextColor={colors.textDim}
          style={[s.input, { marginTop: 6 }]}
        />
      </View>

      {!editing ? (
        <View style={s.field}>
          <Text style={s.label}>BUDGET THIS MONTH</Text>
          <View style={s.currencyWrap}>
            <Text style={s.currencyPrefix}>$</Text>
            <TextInput
              value={budgeted}
              onChangeText={setBudgeted}
              placeholder="0"
              placeholderTextColor={colors.textDim}
              keyboardType="decimal-pad"
              style={s.currencyInput}
            />
          </View>
          <Text style={s.hint}>Comes out of To Budget. Copies forward to next month automatically.</Text>
        </View>
      ) : null}

      <View style={s.field}>
        <Text style={s.label}>MATCH PATTERNS</Text>
        <TextInput
          value={patterns}
          onChangeText={setPatterns}
          placeholder="jewel, mariano, costco%"
          placeholderTextColor={colors.textDim}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <Text style={s.hint}>
          Comma-separated, case-insensitive. Each one becomes a rule that files matching transactions here, including past ones. Use % as a wildcard.
        </Text>
      </View>

      <View style={s.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.toggleTitle}>Roll overspending forward</Text>
          <Text style={s.toggleDesc}>
            Off: overspending comes out of next month's To Budget. On: it stays in this category as a negative balance.
          </Text>
        </View>
        <Switch value={rollover} onValueChange={setRollover} trackColor={{ true: colors.accent, false: colors.border }} />
      </View>

      {error ? (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.negative} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable onPress={() => void save()} disabled={busy} style={({ pressed }) => [s.primaryBtn, (busy || pressed) && { opacity: 0.7 }]}>
        {busy ? <ActivityIndicator color={colors.bg} /> : (
          <>
            <Ionicons name={editing ? 'checkmark' : 'add'} size={16} color={colors.bg} />
            <Text style={s.primaryText}>{editing ? 'Save changes' : 'Add category'}</Text>
          </>
        )}
      </Pressable>

      {editing ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => void hide()} disabled={busy} style={[s.secondaryBtn, { flex: 1 }]}>
            <Ionicons name="eye-off-outline" size={16} color={colors.text} />
            <Text style={s.secondaryText}>Hide</Text>
          </Pressable>
          <Pressable onPress={remove} disabled={busy} style={[s.secondaryBtn, { flex: 1 }]}>
            <Ionicons name="trash-outline" size={16} color={colors.negative} />
            <Text style={s.dangerText}>Delete</Text>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}
