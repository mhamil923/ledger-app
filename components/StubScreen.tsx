import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from './ScreenHeader';
import { colors, radius, spacing, type } from '../theme/colors';

interface Bullet {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}

interface Props {
  eyebrow: string;
  title: string;
  layer: number;
  description: string;
  bullets: Bullet[];
}

export function StubScreen({ eyebrow, title, layer, description, bullets }: Props) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader eyebrow={eyebrow} title={title} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusLabel}>LAYER {layer} · COMING SOON</Text>
          </View>
          <Text style={styles.statusDesc}>{description}</Text>
        </View>

        <View style={styles.bullets}>
          {bullets.map((b, i) => (
            <View key={i} style={styles.bullet}>
              <View style={styles.bulletIcon}>
                <Ionicons name={b.icon} size={18} color={colors.accent} />
              </View>
              <Text style={styles.bulletText}>{b.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  statusCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  statusLabel: {
    ...type.micro,
    color: colors.warning,
    letterSpacing: 0.8,
  },
  statusDesc: {
    ...type.body,
    color: colors.text,
    lineHeight: 22,
  },
  bullets: { gap: spacing.md },
  bullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  bulletIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(124, 140, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    ...type.body,
    color: colors.textMuted,
    flex: 1,
  },
});
