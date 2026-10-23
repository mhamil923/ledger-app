import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BudgetCategory } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  category: BudgetCategory;
  spent: number;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Single category row with a horizontal progress bar showing how much of the
 * monthly limit has been spent. Bar turns orange at 80%, red past 100%.
 */
export function BudgetCategoryRow({ category, spent, onEdit, onDelete }: Props) {
  const limit = category.monthly_limit;
  const pct = limit > 0 ? spent / limit : 0;
  const clamped = Math.max(0, Math.min(1, pct));
  const barColor =
    pct > 1 ? colors.negative : pct >= 0.8 ? colors.warning : colors.positive;

  return (
    <View style={styles.row}>
      <View style={styles.headerLine}>
        <Text style={styles.name} numberOfLines={1}>
          {category.name}
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={onEdit}
            hitSlop={8}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="create-outline" size={14} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={onDelete}
            hitSlop={8}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="trash-outline" size={14} color={colors.negative} />
          </Pressable>
        </View>
      </View>

      <View style={styles.amounts}>
        <Text style={[styles.spent, pct > 1 && { color: colors.negative }]}>
          {formatPrice(spent)}
        </Text>
        <Text style={styles.limit}>of {formatPrice(limit)}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.pct, { color: barColor }]}>{Math.round(pct * 100)}%</Text>
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

      {category.match_patterns.length > 0 ? (
        <View style={styles.patternRow}>
          <Ionicons name="pricetag-outline" size={10} color={colors.textDim} />
          <Text style={styles.patternText} numberOfLines={1}>
            {category.match_patterns.join(', ')}
          </Text>
        </View>
      ) : (
        <Text style={styles.noPatternHint}>
          No match patterns — add some to auto-count transactions
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs + 2,
  },
  headerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...type.heading, color: colors.text, fontSize: 14, flex: 1 },
  actions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  amounts: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  spent: {
    ...type.heading,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
    fontSize: 15,
  },
  limit: {
    ...type.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums' as const],
  },
  pct: { ...type.micro, fontWeight: '700', letterSpacing: 0.4 },

  barBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },

  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  patternText: {
    ...type.micro,
    color: colors.textDim,
    flex: 1,
    fontSize: 10,
  },
  noPatternHint: {
    ...type.micro,
    color: colors.textDim,
    fontStyle: 'italic',
    fontSize: 10,
    marginTop: 2,
  },
});
