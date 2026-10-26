import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { QuantSummary, TradeIdea } from '../lib/api';
import { MIN_WIN_CHOICES } from '../lib/prefs';
import { colors, radius, spacing, type } from '../theme/colors';

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * The measured odds behind a trade idea: how often this exact setup reached
 * target 1 before its stop on this asset's own history, plus whether that
 * clears your minimum-win-rate bar.
 */
export function MeasuredOddsBadge({
  idea,
  minWinRate,
  horizon,
}: {
  idea: TradeIdea | null;
  minWinRate: number;
  horizon: string;
}) {
  const bt = idea?.backtest;
  if (!idea) return null;
  if (!bt) {
    const watch = idea.entry_kind === 'waiting' || idea.setup_id === 'none';
    return (
      <View style={[styles.box, styles.boxMuted]}>
        <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
        <Text style={styles.mutedText}>
          {horizon === 'long_term'
            ? 'Long-term accumulation idea — not backtested. Size it as a DCA plan, not a trade.'
            : watch
              ? 'No measured setup is firing on this timeframe. Watch only — no trade.'
              : 'Not backtested.'}
        </Text>
      </View>
    );
  }
  const meets = bt.win_rate_lower >= minWinRate && bt.avg_r > 0;
  const tone = meets ? colors.positive : colors.warning;
  return (
    <View style={[styles.box, { borderColor: `${tone}55`, backgroundColor: `${tone}12` }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.row}>
          <Text style={styles.label}>MEASURED ODDS</Text>
          <View style={[styles.pill, { backgroundColor: `${tone}22` }]}>
            <Text style={[styles.pillText, { color: tone }]}>
              {meets ? `MEETS YOUR ${pct(minWinRate)} BAR` : `BELOW YOUR ${pct(minWinRate)} BAR`}
            </Text>
          </View>
        </View>
        <Text style={styles.big}>
          {pct(bt.win_rate)} <Text style={styles.small}>hit target 1 ({Math.round(bt.win_rate * bt.n)}/{bt.n} past setups)</Text>
        </Text>
        <Text style={styles.small}>
          Conservative estimate {pct(bt.win_rate_lower)} · avg {bt.avg_r >= 0 ? '+' : ''}
          {bt.avg_r.toFixed(2)}R per trade · {pct(bt.t2_rate)} also reached target 2
        </Text>
        <Text style={styles.small}>Setup: {bt.label}</Text>
      </View>
    </View>
  );
}

/**
 * Regime, levels and every setup's backtest on this asset, plus the
 * minimum-win-rate control.
 */
export function QuantPanel({
  quant,
  minWinRate,
  onMinWinRate,
}: {
  quant: QuantSummary;
  minWinRate: number;
  onMinWinRate: (v: number) => void;
}) {
  const rows = [...quant.backtests].filter((b) => b.n >= 5).sort((a, b) => b.win_rate_lower - a.win_rate_lower);
  const hz: Record<string, string> = { intraday: 'Day', short_term: 'Swing', medium_term: 'Position' };
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Text style={styles.label}>QUANT ENGINE</Text>
        <Text style={styles.small}>backtested on this chart&apos;s own history</Text>
      </View>
      <View style={styles.chips}>
        {quant.regime.daily ? <Chip text={`Daily: ${quant.regime.daily}`} /> : null}
        {quant.regime.hourly ? <Chip text={`Hourly: ${quant.regime.hourly}`} /> : null}
        {quant.atr_pct_daily != null ? <Chip text={`Daily range ±${quant.atr_pct_daily.toFixed(1)}%`} /> : null}
        {quant.next_earnings ? <Chip text={`Earnings ${quant.next_earnings}`} warn /> : null}
      </View>

      <View style={[styles.row, { marginTop: spacing.sm }]}>
        <Text style={styles.label}>MY MINIMUM WIN RATE</Text>
        <View style={styles.chips}>
          {MIN_WIN_CHOICES.map((v) => (
            <Pressable
              key={v}
              onPress={() => onMinWinRate(v)}
              style={[styles.choice, v === minWinRate && styles.choiceActive]}
            >
              <Text style={[styles.choiceText, v === minWinRate && { color: colors.bg }]}>{pct(v)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={styles.small}>
        Ideas must clear this on the SAFE (conservative) estimate, so a lucky 5-for-6 streak doesn&apos;t pass. Higher bars mean fewer trades,
        and no setup wins every time.
      </Text>

      <View style={{ marginTop: spacing.sm, gap: 4 }}>
        <View style={styles.btRow}>
          <Text style={[styles.btHz, { color: colors.textDim }]}>TIMEFRAME</Text>
          <Text style={[styles.btLabel, styles.small]}>SETUP</Text>
          <Text style={[styles.btMeta, { width: 40 }]}>WIN</Text>
          <Text style={[styles.btMeta, { width: 38 }]}>SAFE</Text>
          <Text style={[styles.btMeta, { width: 34 }]}>N</Text>
          <Text style={styles.btMeta}>AVG</Text>
        </View>
        {rows.length === 0 ? <Text style={styles.small}>Not enough history to backtest yet.</Text> : null}
        {rows.map((b) => {
          const ok = b.win_rate_lower >= minWinRate && b.avg_r > 0;
          return (
            <View key={`${b.horizon}-${b.setup_id}`} style={styles.btRow}>
              <Text style={styles.btHz}>{hz[b.horizon] ?? b.horizon}</Text>
              <Ionicons
                name={b.direction === 'long' ? 'arrow-up' : 'arrow-down'}
                size={11}
                color={b.direction === 'long' ? colors.positive : colors.negative}
              />
              <Text style={styles.btLabel} numberOfLines={1}>
                {b.label.replace(/ \((long|short)\)$/, '')}
              </Text>
              <Text style={[styles.btNum, { color: ok ? colors.positive : b.avg_r > 0 ? colors.text : colors.textDim }]}>
                {pct(b.win_rate)}
              </Text>
              <Text style={[styles.btMeta, { width: 38 }]}>≥{pct(b.win_rate_lower)}</Text>
              <Text style={[styles.btMeta, { width: 34 }]}>n={b.n}</Text>
              <Text style={[styles.btMeta, { color: b.avg_r > 0 ? colors.positive : colors.negative }]}>
                {b.avg_r >= 0 ? '+' : ''}
                {b.avg_r.toFixed(2)}R
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Chip({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <View style={[styles.chip, warn && { borderColor: `${colors.warning}66` }]}>
      <Text style={[styles.chipText, warn && { color: colors.warning }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  boxMuted: { borderColor: colors.border, backgroundColor: colors.bgCard, alignItems: 'center' },
  mutedText: { ...type.caption, color: colors.textMuted, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  pillText: { ...type.micro, fontWeight: '700', fontSize: 9, letterSpacing: 0.5 },
  big: { ...type.title, color: colors.text, fontVariant: ['tabular-nums' as const] },
  small: { ...type.micro, color: colors.textMuted, lineHeight: 16 },
  panel: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 6,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  chipText: { ...type.micro, color: colors.text, textTransform: 'capitalize' },
  choice: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  choiceActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { ...type.micro, color: colors.text, fontWeight: '700' },
  btRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btHz: { ...type.micro, color: colors.textDim, width: 58 },
  btLabel: { ...type.caption, color: colors.text, flex: 1 },
  btNum: { ...type.caption, fontWeight: '700', width: 40, textAlign: 'right', fontVariant: ['tabular-nums' as const] },
  btMeta: { ...type.micro, color: colors.textDim, width: 48, textAlign: 'right', fontVariant: ['tabular-nums' as const] },
});
