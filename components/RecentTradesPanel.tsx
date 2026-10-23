import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, type AssetType, type TradeIdeaRecord } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  symbol: string;
  assetType: AssetType;
}

const OUTCOME_COLOR: Record<string, string> = {
  target_1: colors.positive,
  target_2: colors.positive,
  target_3: colors.positive,
  stop_hit: colors.negative,
};

function outcomeLabel(t: TradeIdeaRecord): string {
  if (t.status === 'closed') {
    if (t.resolution?.startsWith('target')) {
      const n = t.resolution.split('_')[1];
      return `Target ${n} hit`;
    }
    if (t.resolution === 'stop_hit') return 'Stopped out';
    return t.resolution ?? 'Closed';
  }
  if (t.status === 'active') return 'In trade';
  if (t.status === 'expired') return 'Expired';
  return 'Waiting for entry';
}

function outcomeColor(t: TradeIdeaRecord): string {
  if (t.status === 'closed' && t.resolution) {
    return OUTCOME_COLOR[t.resolution] ?? colors.textMuted;
  }
  if (t.status === 'active') return colors.accent;
  if (t.status === 'expired') return colors.textDim;
  return colors.warning;
}

export function RecentTradesPanel({ symbol, assetType }: Props) {
  const [trades, setTrades] = useState<TradeIdeaRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .getTrades({ symbol, limit: 5 })
      .then((res) => {
        if (cancelled) return;
        setTrades(res.trades);
      })
      .catch(() => {
        if (cancelled) return;
        setTrades([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }
  if (!trades || trades.length === 0) {
    return null;
  }

  const closed = trades.filter((t) => t.status === 'closed');
  const winners = closed.filter((t) => t.resolution?.startsWith('target')).length;
  const losers = closed.filter((t) => t.resolution === 'stop_hit').length;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Recent ideas on {symbol}</Text>
        {closed.length > 0 ? (
          <View style={styles.scoreBlock}>
            <Text style={[styles.score, { color: colors.positive }]}>{winners}W</Text>
            <Text style={styles.scoreSep}>·</Text>
            <Text style={[styles.score, { color: colors.negative }]}>{losers}L</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.list}>
        {trades.map((t) => (
          <View key={t.id} style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.dateBlock}>
                <Text style={styles.date}>{new Date(t.created_at).toISOString().slice(5, 10)}</Text>
                <View
                  style={[
                    styles.directionPill,
                    {
                      backgroundColor:
                        t.direction === 'long'
                          ? `${colors.positive}22`
                          : `${colors.negative}22`,
                    },
                  ]}
                >
                  <Ionicons
                    name={t.direction === 'long' ? 'trending-up' : 'trending-down'}
                    size={10}
                    color={t.direction === 'long' ? colors.positive : colors.negative}
                  />
                  <Text
                    style={[
                      styles.directionText,
                      { color: t.direction === 'long' ? colors.positive : colors.negative },
                    ]}
                  >
                    {t.direction.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.conviction}>conv {t.conviction}</Text>
              </View>
              <Text style={styles.entryText}>
                entry {formatPrice(t.entry_low, assetType)}–{formatPrice(t.entry_high, assetType)}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.outcome, { color: outcomeColor(t) }]}>{outcomeLabel(t)}</Text>
              {t.realized_pnl_pct != null ? (
                <Text
                  style={[
                    styles.pnl,
                    {
                      color: t.realized_pnl_pct >= 0 ? colors.positive : colors.negative,
                    },
                  ]}
                >
                  {t.realized_pnl_pct >= 0 ? '+' : ''}
                  {t.realized_pnl_pct.toFixed(1)}%
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8, fontWeight: '700' },
  scoreBlock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  score: { ...type.caption, fontWeight: '700', fontSize: 11 },
  scoreSep: { color: colors.textDim, fontSize: 11 },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
  },
  rowLeft: { flex: 1, gap: 4 },
  dateBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  date: {
    ...type.micro,
    color: colors.textMuted,
    fontVariant: ['tabular-nums' as const],
    fontSize: 10,
  },
  directionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  directionText: { ...type.micro, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  conviction: { ...type.micro, color: colors.textDim, fontSize: 10 },
  entryText: { ...type.caption, color: colors.textMuted, fontSize: 11 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  outcome: { ...type.caption, fontWeight: '600', fontSize: 12 },
  pnl: { ...type.micro, fontVariant: ['tabular-nums' as const], fontSize: 10, fontWeight: '700' },
});
