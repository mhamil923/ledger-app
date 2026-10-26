import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { colors, radius, spacing, type } from '../theme/colors';

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * The honest scorecard across all your journaled ideas: how the measured
 * (quant-backed) ideas actually did vs what their backtests predicted, next
 * to the older eyeballed ideas.
 */
export function Scorecard() {
  const q = useQuery({ queryKey: ['trades-summary'], queryFn: apiClient.getTradesSummary, staleTime: 5 * 60_000 });
  const sc = q.data?.scorecard;
  if (!sc) return null;
  const m = sc.measured;
  const l = sc.legacy;
  return (
    <View style={styles.card}>
      <Text style={styles.label}>TRACK RECORD (ALL CLOSED IDEAS)</Text>
      {m && m.closed > 0 ? (
        <Row
          title="Measured setups"
          value={`${pct(m.win_rate)} hit (${m.wins}/${m.closed})`}
          sub={m.predicted_win_rate != null ? `backtests predicted ${pct(m.predicted_win_rate)}` : undefined}
          good={m.predicted_win_rate == null || m.win_rate >= m.predicted_win_rate - 0.1}
        />
      ) : (
        <Text style={styles.sub}>Measured setups: no closed trades yet — they'll show here as they resolve.</Text>
      )}
      {l && l.closed > 0 ? (
        <Row title="Before the quant engine" value={`${pct(l.win_rate)} hit (${l.wins}/${l.closed})`} />
      ) : null}
      <Text style={styles.sub}>
        If measured ideas run well below their prediction over 20+ trades, the market has changed — trust the live record over the backtest.
      </Text>
    </View>
  );
}

function Row({ title, value, sub, good }: { title: string; value: string; sub?: string; good?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.value, good === false && { color: colors.warning }]}>{value}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 6 },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...type.caption, color: colors.text },
  value: { ...type.caption, color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums' as const] },
  sub: { ...type.micro, color: colors.textDim, lineHeight: 15 },
});
