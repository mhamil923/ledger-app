import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, getApiBase } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, radius, spacing, type } from '../theme/colors';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const readyQuery = useQuery({
    queryKey: ['readiness'],
    queryFn: apiClient.readiness,
    staleTime: 30_000,
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitle: 'Settings',
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Section title="ACCOUNT">
            <Row label="Signed in as" value={user?.email ?? '—'} />
            <Row label="User ID" value={user?.id ?? '—'} mono />
          </Section>

          <Section title="BACKEND">
            <Row label="API base" value={getApiBase()} mono />
            {readyQuery.isLoading ? (
              <View style={styles.checkRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.checkLabel}>Checking…</Text>
              </View>
            ) : readyQuery.isError ? (
              <View style={styles.checkRow}>
                <Ionicons name="close-circle" size={18} color={colors.negative} />
                <Text style={styles.checkLabel}>Backend not reachable</Text>
              </View>
            ) : readyQuery.data ? (
              <>
                <CheckRow
                  label="Database"
                  ok={readyQuery.data.checks.database}
                  hint={readyQuery.data.checks.database ? 'connected' : 'unreachable'}
                />
                <CheckRow
                  label="Anthropic (AI analysis)"
                  ok={readyQuery.data.checks.anthropic}
                  hint={
                    readyQuery.data.checks.anthropic
                      ? 'configured'
                      : 'add ANTHROPIC_API_KEY to backend .env'
                  }
                />
                <CheckRow
                  label="Finnhub (stock/ETF quotes + search)"
                  ok={readyQuery.data.checks.finnhub}
                  hint={
                    readyQuery.data.checks.finnhub
                      ? 'configured'
                      : 'add FINNHUB_API_KEY to backend .env'
                  }
                />
                <CheckRow
                  label="Twelve Data (stock/ETF charts)"
                  ok={readyQuery.data.checks.twelvedata}
                  hint={
                    readyQuery.data.checks.twelvedata
                      ? 'configured'
                      : 'add TWELVE_DATA_API_KEY to backend .env'
                  }
                />
                <CheckRow
                  label="Alpaca Paper (stock trading, fake money)"
                  ok={readyQuery.data.checks.alpaca_paper}
                  hint={
                    readyQuery.data.checks.alpaca_paper
                      ? 'configured'
                      : 'add ALPACA_PAPER_API_KEY + ALPACA_PAPER_API_SECRET to .env'
                  }
                />
                <CheckRow
                  label="Alpaca Live (stock trading, real money)"
                  ok={readyQuery.data.checks.alpaca_live}
                  hint={
                    readyQuery.data.checks.alpaca_live
                      ? 'configured · LIVE trading enabled'
                      : 'add ALPACA_LIVE_API_KEY + ALPACA_LIVE_API_SECRET to .env'
                  }
                />
                <CheckRow
                  label="Coinbase Advanced Trade (crypto, real money)"
                  ok={readyQuery.data.checks.coinbase_trade}
                  hint={
                    readyQuery.data.checks.coinbase_trade
                      ? 'configured · LIVE trading enabled'
                      : 'add COINBASE_API_KEY_NAME + COINBASE_API_PRIVATE_KEY to .env'
                  }
                />
              </>
            ) : null}
            <Pressable
              onPress={() => void readyQuery.refetch()}
              style={({ pressed }) => [styles.refreshLink, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="refresh" size={12} color={colors.accent} />
              <Text style={styles.refreshLinkText}>Re-check</Text>
            </Pressable>
          </Section>

          <Section title="DANGER">
            <Pressable
              onPress={async () => {
                await logout();
                router.replace('/login');
              }}
              style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.negative} />
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </Section>

          <Text style={styles.footer}>Ledger · personal financial OS</Text>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function CheckRow({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <View style={styles.checkRow}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'alert-circle'}
        size={18}
        color={ok ? colors.positive : colors.warning}
      />
      <View style={styles.checkBody}>
        <Text style={styles.checkLabel}>{label}</Text>
        <Text style={[styles.checkHint, !ok && { color: colors.warning }]}>{hint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  sectionBody: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.md,
  },
  rowLabel: { ...type.caption, color: colors.textMuted },
  rowValue: { ...type.caption, color: colors.text, flex: 1, textAlign: 'right' },
  rowValueMono: { fontFamily: 'monospace', fontSize: 12 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  checkBody: { flex: 1, gap: 2 },
  checkLabel: { ...type.caption, color: colors.text },
  checkHint: { ...type.micro, color: colors.textDim },
  refreshLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  refreshLinkText: { ...type.micro, color: colors.accent },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  signOutText: { ...type.body, color: colors.negative, fontWeight: '600' },
  footer: { ...type.micro, color: colors.textDim, textAlign: 'center', marginTop: spacing.xl },
});
