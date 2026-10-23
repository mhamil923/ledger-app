import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AnalysisData } from '../lib/api';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  data: AnalysisData;
}

/**
 * Renders the deep-dive-only enrichment fields: confluence factors,
 * multi-timeframe read, alternative scenarios, catalysts, position sizing.
 * Hidden when none of these are present (default-tier analyses).
 */
export function DeepDiveExtras({ data }: Props) {
  const hasAnything =
    (data.confluence_factors && data.confluence_factors.length > 0) ||
    !!data.multi_timeframe ||
    (data.alternative_scenarios && data.alternative_scenarios.length > 0) ||
    (data.catalysts && data.catalysts.length > 0) ||
    !!data.position_sizing;
  if (!hasAnything) return null;

  return (
    <View style={styles.root}>
      <View style={styles.badge}>
        <Ionicons name="sparkles" size={11} color={colors.warning} />
        <Text style={styles.badgeText}>DEEP DIVE EXTRAS</Text>
      </View>

      {data.confluence_factors && data.confluence_factors.length > 0 ? (
        <Card title="Confluence" icon="git-merge-outline" iconColor={colors.positive}>
          {data.confluence_factors.map((c, i) => (
            <Bullet key={i} text={c} bulletColor={colors.positive} />
          ))}
        </Card>
      ) : null}

      {data.multi_timeframe ? (
        <Card title="Multi-timeframe read" icon="layers-outline" iconColor={colors.accent}>
          <TimeframeRow label="Short-term" body={data.multi_timeframe.short_term} />
          <TimeframeRow label="Medium-term" body={data.multi_timeframe.medium_term} />
          <TimeframeRow label="Long-term" body={data.multi_timeframe.long_term} />
        </Card>
      ) : null}

      {data.alternative_scenarios && data.alternative_scenarios.length > 0 ? (
        <Card title="Alternative scenarios" icon="git-branch-outline" iconColor={colors.warning}>
          {data.alternative_scenarios.map((s, i) => (
            <View key={i} style={styles.scenarioRow}>
              <View style={styles.scenarioCol}>
                <Text style={styles.scenarioLabel}>IF</Text>
                <Text style={styles.scenarioText}>{s.if}</Text>
              </View>
              <View style={styles.scenarioCol}>
                <Text style={[styles.scenarioLabel, { color: colors.accent }]}>THEN</Text>
                <Text style={styles.scenarioText}>{s.then}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {data.catalysts && data.catalysts.length > 0 ? (
        <Card title="Catalysts to watch" icon="alarm-outline" iconColor={colors.warning}>
          {data.catalysts.map((c, i) => (
            <Bullet key={i} text={c} bulletColor={colors.warning} />
          ))}
        </Card>
      ) : null}

      {data.position_sizing ? (
        <Card title="Position sizing" icon="resize-outline" iconColor={colors.accent}>
          <Text style={styles.sizingText}>{data.position_sizing}</Text>
        </Card>
      ) : null}
    </View>
  );
}

function Card({
  title,
  icon,
  iconColor,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={14} color={iconColor} />
        <Text style={styles.cardTitle}>{title.toUpperCase()}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Bullet({ text, bulletColor }: { text: string; bulletColor: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: bulletColor }]} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function TimeframeRow({ label, body }: { label: string; body: string }) {
  return (
    <View style={styles.tfRow}>
      <Text style={styles.tfLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.tfBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  badgeText: { ...type.micro, color: colors.warning, fontWeight: '700', letterSpacing: 0.8 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  cardTitle: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8, fontWeight: '700' },
  cardBody: { gap: 6 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 2 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  bulletText: { ...type.caption, color: colors.text, flex: 1, lineHeight: 20 },
  tfRow: { paddingVertical: spacing.xs, gap: 2 },
  tfLabel: { ...type.micro, color: colors.textDim, letterSpacing: 0.6, fontSize: 9 },
  tfBody: { ...type.caption, color: colors.text, lineHeight: 19 },
  scenarioRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  scenarioCol: { flex: 1, gap: 2 },
  scenarioLabel: { ...type.micro, color: colors.warning, letterSpacing: 0.6, fontSize: 9, fontWeight: '700' },
  scenarioText: { ...type.caption, color: colors.text, lineHeight: 18 },
  sizingText: { ...type.caption, color: colors.text, lineHeight: 20 },
});
