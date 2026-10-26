import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MeasuredOddsBadge } from './MeasuredOdds';
import type { AnalysisData, AssetType, EntryKind } from '../lib/api';
import { formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

const BIAS_COLOR: Record<string, string> = {
  bullish: colors.positive,
  bearish: colors.negative,
  neutral: colors.textMuted,
};

const HORIZON_LABEL: Record<string, string> = {
  intraday: 'Intraday',
  short_term: 'Short-term · days',
  medium_term: 'Medium-term · weeks',
  long_term: 'Long-term · months',
};

const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  trigger_now: 'Enter now',
  pullback: 'Wait for pullback',
  breakout: 'Wait for breakout',
  waiting: 'Watching · not ready',
};

interface Props {
  data: AnalysisData;
  assetType: AssetType;
  /** Which horizon's trade idea to display. Falls back to primary_horizon. */
  selectedHorizon?: 'intraday' | 'short_term' | 'medium_term' | 'long_term';
  /** Latest live price for status calculations (TRIGGERED / IN ZONE / etc). */
  livePrice?: number | null;
  onTakeTrade?: () => void;
  /** Conservative measured win rate an idea needs to count as a trade. */
  minWinRate?: number;
}

export function TradeIdeaCard({
  data,
  assetType,
  selectedHorizon,
  livePrice,
  onTakeTrade,
  minWinRate = 0.6,
}: Props) {
  const biasColor = BIAS_COLOR[data.bias] ?? colors.textMuted;
  const horizon = selectedHorizon ?? data.primary_horizon ?? data.time_horizon;
  const tradeIdea = data.trade_ideas?.[horizon] ?? null;
  // Per-horizon conviction overrides the asset-level fallback when present.
  const conviction = tradeIdea?.conviction ?? data.conviction;

  return (
    <View style={styles.root}>
      {/* Headline + bias/conviction */}
      <View style={styles.headerCard}>
        <View style={styles.chipRow}>
          <View style={[styles.biasChip, { backgroundColor: `${biasColor}22`, borderColor: `${biasColor}55` }]}>
            <View style={[styles.biasDot, { backgroundColor: biasColor }]} />
            <Text style={[styles.biasText, { color: biasColor }]}>{data.bias.toUpperCase()}</Text>
          </View>
          <View style={styles.convictionWrap}>
            <Text style={styles.metaLabel}>CONVICTION</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Ionicons
                  key={n}
                  name={n <= conviction ? 'star' : 'star-outline'}
                  size={11}
                  color={n <= conviction ? colors.warning : colors.textDim}
                />
              ))}
            </View>
          </View>
          <View style={styles.horizonWrap}>
            <Text style={styles.metaLabel}>HORIZON</Text>
            <Text style={styles.horizonText}>{HORIZON_LABEL[horizon] ?? horizon}</Text>
          </View>
        </View>
        <Text style={styles.headline}>{data.headline}</Text>
      </View>

      <MeasuredOddsBadge idea={tradeIdea} minWinRate={minWinRate} horizon={horizon} />

      {tradeIdea ? (
        <TradePlan
          idea={tradeIdea}
          assetType={assetType}
          livePrice={livePrice}
          onTakeTrade={onTakeTrade}
        />
      ) : (
        <NoTradeCard />
      )}

      <KeyLevelsCard data={data} assetType={assetType} />

      {data.risks.length > 0 ? <RisksCard risks={data.risks} /> : null}
    </View>
  );
}

function TradePlan({
  idea,
  assetType,
  livePrice,
  onTakeTrade,
}: {
  idea: NonNullable<AnalysisData['trade_ideas']['intraday']>;
  assetType: AssetType;
  livePrice?: number | null;
  onTakeTrade?: () => void;
}) {
  const entryLow = idea.entry_zone?.[0];
  const entryHigh = idea.entry_zone?.[1];
  if (typeof entryLow !== 'number' || typeof entryHigh !== 'number') {
    // Malformed trade idea — render the "Claude declined" card so we still render something useful.
    return <NoTradeCard />;
  }
  const isLong = idea.direction === 'long';
  const dirColor = isLong ? colors.positive : colors.negative;
  const rr = riskReward(idea);
  const status = computeTradeStatus(idea, livePrice);

  return (
    <View style={styles.tradeCard}>
      <View style={styles.tradeHeader}>
        <View style={[styles.directionPill, { backgroundColor: `${dirColor}22`, borderColor: `${dirColor}55` }]}>
          <Ionicons
            name={isLong ? 'trending-up' : 'trending-down'}
            size={12}
            color={dirColor}
          />
          <Text style={[styles.directionText, { color: dirColor }]}>{idea.direction.toUpperCase()}</Text>
        </View>
        <Text style={styles.tradeTitle}>Trade idea</Text>
        {rr != null ? (
          <Text style={styles.rrText}>R:R {rr.toFixed(2)}</Text>
        ) : null}
      </View>

      {idea.entry_kind || status ? (
        <View style={styles.statusRow}>
          {idea.entry_kind ? (
            <View style={styles.entryKindChip}>
              <Ionicons
                name={entryKindIcon(idea.entry_kind)}
                size={11}
                color={colors.textMuted}
              />
              <Text style={styles.entryKindText}>{ENTRY_KIND_LABEL[idea.entry_kind]}</Text>
            </View>
          ) : null}
          {status ? (
            <View
              style={[
                styles.statusChip,
                { backgroundColor: `${status.color}22`, borderColor: `${status.color}55` },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.levelsGrid}>
        <LevelRow
          label="ENTRY"
          color={colors.accent}
          value={`${formatPrice(entryLow, assetType)} – ${formatPrice(entryHigh, assetType)}`}
        />
        <LevelRow
          label="STOP"
          color={colors.negative}
          value={formatPrice(idea.stop_loss, assetType)}
        />
        {(Array.isArray(idea.targets) ? idea.targets : []).map((t, i) => (
          <LevelRow
            key={i}
            label={`TARGET ${i + 1}`}
            color={colors.positive}
            value={formatPrice(t, assetType)}
          />
        ))}
      </View>

      <Text style={styles.rationale}>{idea.rationale}</Text>

      {onTakeTrade ? (
        <Pressable
          onPress={onTakeTrade}
          style={({ pressed }) => [styles.takeTradeButton, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="rocket-outline" size={14} color={colors.bg} />
          <Text style={styles.takeTradeText}>Take this trade</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function NoTradeCard() {
  return (
    <View style={styles.noTradeCard}>
      <Ionicons name="hand-left-outline" size={16} color={colors.textMuted} />
      <Text style={styles.noTradeText}>
        Claude declined to propose a trade — signals were mixed or the setup wasn't compelling.
      </Text>
    </View>
  );
}

function KeyLevelsCard({ data, assetType }: { data: AnalysisData; assetType: AssetType }) {
  const support = Array.isArray(data.key_levels?.support) ? data.key_levels.support : [];
  const resistance = Array.isArray(data.key_levels?.resistance) ? data.key_levels.resistance : [];
  if (support.length === 0 && resistance.length === 0) return null;
  return (
    <View style={styles.levelsCard}>
      <Text style={styles.sectionLabel}>KEY LEVELS</Text>
      {resistance.length > 0 ? (
        <View style={styles.levelSection}>
          <Text style={styles.levelSectionLabel}>Resistance</Text>
          {resistance.map((p, i) => (
            <View key={i} style={styles.levelRow}>
              <View style={[styles.levelDot, { backgroundColor: colors.negative }]} />
              <Text style={styles.levelValue}>{formatPrice(p, assetType)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {support.length > 0 ? (
        <View style={styles.levelSection}>
          <Text style={styles.levelSectionLabel}>Support</Text>
          {support.map((p, i) => (
            <View key={i} style={styles.levelRow}>
              <View style={[styles.levelDot, { backgroundColor: colors.positive }]} />
              <Text style={styles.levelValue}>{formatPrice(p, assetType)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RisksCard({ risks }: { risks: string[] }) {
  return (
    <View style={styles.risksCard}>
      <Text style={styles.sectionLabel}>RISKS</Text>
      {risks.map((r, i) => (
        <View key={i} style={styles.riskRow}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.riskText}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

function LevelRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.rowItem}>
      <View style={styles.rowLabelBlock}>
        <View style={[styles.rowSwatch, { backgroundColor: color }]} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

interface TradeStatus {
  label: string;
  color: string;
}

/**
 * Compare the live price against the trade idea's entry zone and stop to
 * surface whether the idea is still actionable. Returns null when we can't
 * compute (no live price, or malformed idea).
 *
 * Statuses:
 *  - INVALIDATED: live price has passed the stop, the thesis is dead.
 *  - TRIGGERED:   for breakouts, price has cleared the entry zone.
 *  - IN ZONE:     for trigger_now/pullback, price is currently in entry_zone.
 *  - PENDING:     setup is valid, waiting for entry.
 */
function computeTradeStatus(
  idea: NonNullable<AnalysisData['trade_ideas']['intraday']>,
  livePrice?: number | null,
): TradeStatus | null {
  if (typeof livePrice !== 'number' || !Number.isFinite(livePrice)) return null;
  const lo = idea.entry_zone?.[0];
  const hi = idea.entry_zone?.[1];
  const stop = idea.stop_loss;
  if (typeof lo !== 'number' || typeof hi !== 'number' || typeof stop !== 'number') return null;
  const zLo = Math.min(lo, hi);
  const zHi = Math.max(lo, hi);
  const isLong = idea.direction === 'long';

  // For pending entry kinds (breakout / waiting), the trade isn't active
  // until the entry zone is actually crossed. Price being at/below the stop
  // BEFORE that doesn't mean the trade was invalidated — it means we're
  // sitting in pre-trade territory, watching for the trigger.
  const isPending = idea.entry_kind === 'breakout' || idea.entry_kind === 'waiting';

  const stoppedOut = isLong ? livePrice <= stop : livePrice >= stop;
  if (stoppedOut && !isPending) {
    return { label: 'INVALIDATED', color: colors.negative };
  }

  const inZone = livePrice >= zLo && livePrice <= zHi;
  if (inZone) return { label: 'IN ZONE', color: colors.accent };

  if (idea.entry_kind === 'breakout') {
    const triggered = isLong ? livePrice > zHi : livePrice < zLo;
    if (triggered) return { label: 'TRIGGERED', color: colors.positive };
    // For breakouts, "below" the zone for a long (or above for a short) is
    // the expected pre-trigger state — show as WATCHING, not invalidated.
    return { label: 'WATCHING', color: colors.textMuted };
  }
  if (idea.entry_kind === 'waiting') {
    return { label: 'WATCHING', color: colors.textMuted };
  }
  if (idea.entry_kind === 'trigger_now' || idea.entry_kind === 'pullback') {
    // For at-market / pullback ideas, if price has already moved AWAY from the
    // entry in the trade's direction, the easy fill is gone.
    const movedAway = isLong ? livePrice > zHi : livePrice < zLo;
    if (movedAway) return { label: 'MISSED', color: colors.warning };
  }

  return { label: 'PENDING', color: colors.textMuted };
}

function entryKindIcon(kind: EntryKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'trigger_now':
      return 'flash-outline';
    case 'pullback':
      return 'arrow-undo-outline';
    case 'breakout':
      return 'arrow-forward-outline';
    case 'waiting':
      return 'time-outline';
  }
}

function riskReward(idea: NonNullable<AnalysisData['trade_ideas']['intraday']>): number | null {
  const entryLow = idea.entry_zone?.[0];
  const entryHigh = idea.entry_zone?.[1];
  const stop = idea.stop_loss;
  const firstTarget = idea.targets?.[0];
  if (
    typeof entryLow !== 'number' ||
    typeof entryHigh !== 'number' ||
    typeof stop !== 'number' ||
    typeof firstTarget !== 'number'
  ) {
    return null;
  }
  const entryMid = (entryLow + entryHigh) / 2;
  const risk = Math.abs(entryMid - stop);
  if (risk === 0) return null;
  return Math.abs(firstTarget - entryMid) / risk;
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  headerCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  biasChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  biasDot: { width: 6, height: 6, borderRadius: 3 },
  biasText: { ...type.micro, fontWeight: '700', letterSpacing: 0.6 },
  convictionWrap: { gap: 2 },
  horizonWrap: { flex: 1, gap: 2 },
  metaLabel: { ...type.micro, color: colors.textDim, letterSpacing: 0.5, fontSize: 9 },
  starsRow: { flexDirection: 'row', gap: 2 },
  horizonText: { ...type.micro, color: colors.text, fontSize: 11 },
  headline: { ...type.body, color: colors.text, lineHeight: 22 },

  tradeCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  tradeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  directionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  directionText: { ...type.micro, fontWeight: '700', letterSpacing: 0.6 },
  tradeTitle: { ...type.heading, color: colors.text, flex: 1, fontSize: 15 },
  rrText: { ...type.micro, color: colors.textMuted, fontVariant: ['tabular-nums' as const] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  entryKindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgElevated,
  },
  entryKindText: { ...type.micro, color: colors.textMuted, fontWeight: '600', letterSpacing: 0.4 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...type.micro, fontWeight: '700', letterSpacing: 0.6 },
  levelsGrid: { gap: 6 },
  rowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
  },
  rowLabelBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowSwatch: { width: 8, height: 8, borderRadius: 2 },
  rowLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.5 },
  rowValue: { ...type.caption, color: colors.text, fontVariant: ['tabular-nums' as const], fontWeight: '600' },
  rationale: { ...type.caption, color: colors.textMuted, lineHeight: 19, marginTop: 4 },
  takeTradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md - 2,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  takeTradeText: { ...type.heading, color: colors.bg, fontSize: 14 },

  noTradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
  },
  noTradeText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },

  levelsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionLabel: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  levelSection: { gap: 4 },
  levelSectionLabel: { ...type.micro, color: colors.textDim, fontSize: 10 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelValue: { ...type.caption, color: colors.text, fontVariant: ['tabular-nums' as const] },

  risksCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  riskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  riskText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },
});
