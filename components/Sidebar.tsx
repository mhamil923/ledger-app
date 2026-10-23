import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { colors, radius, spacing, type } from '../theme/colors';

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  {
    href: '/(tabs)',
    label: 'Watchlist',
    icon: 'trending-up',
    match: (p) => p === '/' || p === '/(tabs)' || p === '/index',
  },
  {
    href: '/(tabs)/portfolio',
    label: 'Portfolio',
    icon: 'pie-chart-outline',
    match: (p) => p.includes('portfolio') || p.includes('holding'),
  },
  {
    href: '/(tabs)/accounts',
    label: 'Accounts',
    icon: 'wallet-outline',
    match: (p) => p.includes('accounts'),
  },
  {
    href: '/(tabs)/spending',
    label: 'Spending',
    icon: 'receipt-outline',
    match: (p) => p.includes('spending'),
  },
  {
    href: '/(tabs)/bills',
    label: 'Bills',
    icon: 'calendar-outline',
    match: (p) => p.includes('bills'),
  },
  {
    href: '/(tabs)/budget',
    label: 'Budget',
    icon: 'pie-chart',
    match: (p) => p.includes('budget'),
  },
];

export const SIDEBAR_WIDTH = 232;

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.logoBlock}>
          <View style={styles.logoDot} />
          <Text style={styles.logoText}>LEDGER</Text>
        </View>
      </View>

      <View style={styles.nav}>
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href as never)}
              style={({ pressed }) => [
                styles.navItem,
                active && styles.navItemActive,
                pressed && !active && styles.navItemPressed,
              ]}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? colors.text : colors.textMuted}
              />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
              {active ? <View style={styles.activeIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.userBlock, pressed && styles.userBlockPressed]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.email ?? '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user?.email ?? 'Signed out'}
            </Text>
            <Text style={styles.userHint}>Settings</Text>
          </View>
          <Ionicons name="settings-outline" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => void logout()}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.6 }]}
          hitSlop={6}
        >
          <Ionicons name="log-out-outline" size={14} color={colors.textDim} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: colors.bgElevated,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    justifyContent: 'space-between',
  },
  header: { paddingHorizontal: spacing.sm, marginBottom: spacing.xl },
  logoBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  logoText: {
    ...type.heading,
    color: colors.text,
    letterSpacing: 2,
    fontSize: 14,
    fontWeight: '800',
  },
  nav: { flex: 1, gap: 2 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    position: 'relative',
  },
  navItemActive: { backgroundColor: colors.bgCard },
  navItemPressed: { backgroundColor: colors.bgCard, opacity: 0.7 },
  navLabel: { ...type.body, color: colors.textMuted, fontSize: 14, fontWeight: '500', flex: 1 },
  navLabelActive: { color: colors.text, fontWeight: '600' },
  activeIndicator: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.accent,
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -9,
  },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  userBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  userBlockPressed: { backgroundColor: colors.bgCard },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.caption, color: colors.bg, fontWeight: '700' },
  userMeta: { flex: 1, gap: 1 },
  userEmail: { ...type.caption, color: colors.text, fontWeight: '600' },
  userHint: { ...type.micro, color: colors.textDim, fontSize: 10 },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.xs + 2,
  },
  signOutText: { ...type.micro, color: colors.textDim, letterSpacing: 0.3 },
});
