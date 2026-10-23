import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, type } from '../theme/colors';

export interface HeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel?: string;
}

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Optional element rendered next to the subtitle (e.g. a LIVE pulse indicator). */
  subtitleAdornment?: ReactNode;
  /** Convenience for a single right-side action (legacy). */
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  /** Up to a few right-side action buttons. */
  actions?: HeaderAction[];
  style?: ViewStyle;
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  subtitleAdornment,
  rightIcon,
  onRightPress,
  actions,
  style,
}: Props) {
  const resolvedActions: HeaderAction[] =
    actions ??
    (rightIcon
      ? [{ icon: rightIcon, onPress: onRightPress ?? (() => undefined) }]
      : []);

  return (
    <View style={[styles.root, style]}>
      <View style={styles.left}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle || subtitleAdornment ? (
          <View style={styles.subtitleRow}>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {subtitleAdornment}
          </View>
        ) : null}
      </View>
      {resolvedActions.length > 0 ? (
        <View style={styles.actionRow}>
          {resolvedActions.map((a, i) => (
            <Pressable
              key={i}
              onPress={a.onPress}
              accessibilityLabel={a.accessibilityLabel}
              style={({ pressed }) => [
                styles.iconButton,
                a.active && styles.iconButtonActive,
                pressed && styles.iconButtonPressed,
              ]}
              hitSlop={12}
            >
              <Ionicons
                name={a.icon}
                size={20}
                color={a.active ? colors.bg : colors.text}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.lg,
  },
  left: { flex: 1, gap: spacing.xs },
  eyebrow: {
    ...type.micro,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  title: {
    ...type.display,
    color: colors.text,
  },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  subtitle: {
    ...type.body,
    color: colors.textMuted,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  iconButtonPressed: { opacity: 0.6 },
});
