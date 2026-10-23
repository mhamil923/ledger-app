import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LotInput } from '../lib/api';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  symbol: string;
  onClose: () => void;
  onSubmit: (lot: LotInput) => Promise<void>;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AddLotModal({ visible, symbol, onClose, onSubmit }: Props) {
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (): void => {
    setQuantity('');
    setCost('');
    setDate(todayIso());
    setError(null);
    setBusy(false);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const submit = async (): Promise<void> => {
    const qtyNum = parseFloat(quantity);
    const costNum = parseFloat(cost);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError('Quantity must be positive.');
      return;
    }
    if (!Number.isFinite(costNum) || costNum < 0) {
      setError('Cost must be zero or positive.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date must be YYYY-MM-DD.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ quantity: qtyNum, cost_per_unit: costNum, acquired_at: date });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add lot');
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
              <View>
                <Text style={styles.eyebrow}>ADD LOT</Text>
                <Text style={styles.title}>{symbol}</Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>QUANTITY</Text>
                <TextInput
                  style={styles.input}
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder="0.25"
                  placeholderTextColor={colors.textDim}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>COST / UNIT</Text>
                <TextInput
                  style={styles.input}
                  value={cost}
                  onChangeText={setCost}
                  placeholder="0"
                  placeholderTextColor={colors.textDim}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>ACQUIRED ON (YYYY-MM-DD)</Text>
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
              disabled={busy || !quantity.trim() || !cost.trim()}
              style={({ pressed }) => [
                styles.button,
                (busy || !quantity.trim() || !cost.trim()) && styles.buttonDisabled,
                pressed && !busy && styles.buttonPressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.buttonText}>Add lot</Text>
              )}
            </Pressable>
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
    gap: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  eyebrow: { ...type.micro, color: colors.accent },
  title: { ...type.title, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  field: { gap: spacing.sm },
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
  error: { ...type.caption, color: colors.negative },
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
