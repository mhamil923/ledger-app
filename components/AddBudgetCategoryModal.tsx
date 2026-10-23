import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BudgetCategory } from '../lib/api';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  /** If provided, the modal is in edit mode and prefills these values. */
  editing: BudgetCategory | null;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    monthly_limit: number;
    match_patterns: string[];
  }) => Promise<void>;
}

/**
 * Modal to add or edit a budget category. Match patterns are entered as a
 * comma-separated list; each item becomes a case-insensitive substring match
 * against transaction description + merchant. Supports `%` as a wildcard so
 * "AMZN%" matches AMZN-prefixed lines.
 */
export function AddBudgetCategoryModal({ visible, editing, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [patterns, setPatterns] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setLimit(String(editing.monthly_limit || ''));
      setPatterns(editing.match_patterns.join(', '));
    } else {
      setName('');
      setLimit('');
      setPatterns('');
    }
    setError(null);
  }, [visible, editing]);

  const handleSubmit = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    const limitNum = Number(limit);
    if (!Number.isFinite(limitNum) || limitNum < 0) {
      setError('Enter a valid monthly limit.');
      return;
    }
    const patternList = patterns
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        monthly_limit: limitNum,
        match_patterns: patternList,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
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
              <Text style={styles.eyebrow}>{editing ? 'EDIT CATEGORY' : 'NEW CATEGORY'}</Text>
              <Text style={styles.title}>{editing ? editing.name : 'Add category'}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.field}>
              <Text style={styles.label}>NAME</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Groceries"
                placeholderTextColor={colors.textDim}
                style={styles.input}
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>MONTHLY LIMIT</Text>
              <View style={styles.currencyInputWrap}>
                <Text style={styles.currencyPrefix}>$</Text>
                <TextInput
                  value={limit}
                  onChangeText={setLimit}
                  placeholder="600"
                  placeholderTextColor={colors.textDim}
                  keyboardType="decimal-pad"
                  style={styles.currencyInput}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>MATCH PATTERNS</Text>
              <TextInput
                value={patterns}
                onChangeText={setPatterns}
                placeholder="whole foods, trader joe, kroger, safeway"
                placeholderTextColor={colors.textDim}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
              <Text style={styles.hint}>
                Comma-separated. Case-insensitive. Each pattern matches against transaction
                description + merchant. Use % as a wildcard (e.g. "AMZN%").
              </Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.negative} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitBtn,
                (submitting || pressed) && { opacity: 0.7 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Ionicons
                    name={editing ? 'checkmark' : 'add'}
                    size={16}
                    color={colors.bg}
                  />
                  <Text style={styles.submitText}>
                    {editing ? 'Save changes' : 'Add category'}
                  </Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
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
    paddingBottom: spacing.xl,
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
  body: { gap: spacing.md, paddingBottom: spacing.md },
  field: { gap: 4 },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontSize: 15,
  },
  currencyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
  hint: { ...type.micro, color: colors.textDim, lineHeight: 16 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  errorText: { ...type.caption, color: colors.negative, flex: 1 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  submitText: { ...type.heading, color: colors.bg, fontSize: 15 },
});
