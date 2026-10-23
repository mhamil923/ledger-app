import { useState } from 'react';
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
import type { BillCadence, BillInput } from '../lib/api';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: BillInput) => Promise<void>;
}

const CADENCES: { value: BillCadence; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AddBillModal({ visible, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState<BillCadence>('monthly');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (): void => {
    setName('');
    setAmount('');
    setCadence('monthly');
    setDate(todayIso());
    setError(null);
    setBusy(false);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const submit = async (): Promise<void> => {
    if (!name.trim() || !amount.trim()) return;
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setError('Amount must be zero or positive.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date must be YYYY-MM-DD.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        amount: amountNum,
        cadence,
        next_due_date: date,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bill');
    } finally {
      setBusy(false);
    }
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
              <Text style={styles.title}>Add bill</Text>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.field}>
                <Text style={styles.label}>NAME</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Netflix, Comcast, Car insurance…"
                  placeholderTextColor={colors.textDim}
                  maxLength={200}
                  autoFocus
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>AMOUNT</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.dollarSign}>$</Text>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={colors.textDim}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>CADENCE</Text>
                <View style={styles.cadenceGrid}>
                  {CADENCES.map((c) => (
                    <Pressable
                      key={c.value}
                      onPress={() => setCadence(c.value)}
                      style={[styles.cadenceOption, cadence === c.value && styles.cadenceOptionActive]}
                    >
                      <Text
                        style={[
                          styles.cadenceText,
                          cadence === c.value && styles.cadenceTextActive,
                        ]}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>NEXT DUE (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={date}
                  onChangeText={setDate}
                  placeholder={todayIso()}
                  placeholderTextColor={colors.textDim}
                  autoCorrect={false}
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                onPress={() => void submit()}
                disabled={busy || !name.trim() || !amount.trim()}
                style={({ pressed }) => [
                  styles.button,
                  (busy || !name.trim() || !amount.trim()) && styles.buttonDisabled,
                  pressed && !busy && styles.buttonPressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.buttonText}>Add bill</Text>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

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
    maxHeight: '90%',
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
  title: { ...type.title, color: colors.text },
  field: { gap: spacing.sm, marginBottom: spacing.lg },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
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
  amountRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  dollarSign: {
    ...type.title,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    minWidth: 16,
    textAlign: 'center',
  },
  amountInput: { flex: 1 },
  cadenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cadenceOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cadenceOptionActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  cadenceText: { ...type.caption, color: colors.textMuted },
  cadenceTextActive: { color: colors.bg, fontWeight: '700' },
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
