import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HoldingSummary } from '../lib/api';
import { formatPercent, formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

const ASSET_LABEL: Record<string, string> = {
  stock: 'STOCK',
  crypto: 'CRYPTO',
  etf: 'ETF',
};

function formatQuantity(qty: number): string {
  if (qty === 0) return '0';
  if (Math.abs(qty) >= 1000) return qty.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(qty) >= 1) return qty.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return qty.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

interface Props {
  holding: HoldingSummary;
  accentColor?: string;
  onPress: (holding: HoldingSummary) => void;
}

export function HoldingRow({ holding, accentColor, onPress }: Props) {
  const pl = holding.unrealized_pl;
  const plPct = holding.unrealized_pl_pct;
  const positive = (pl ?? 0) >= 0;
  const plColor = pl == null ? colors.textDim : positive ? colors.positive : colors.negative;

  return (
    <Pressable
      onPress={() => onPress(holding)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {accentColor ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.symbolBlock}>
            <Text style={styles.symbol}>{holding.symbol}</Text>
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText}>{ASSET_LABEL[holding.asset_type] ?? holding.asset_type}</Text>
            </View>
          </View>
          <Text style={styles.value}>
            {holding.market_value != null
              ? formatPrice(holding.market_value)
              : holding.quote_error
                ? '—'
                : formatPrice(holding.total_cost)}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.subText}>
            {formatQuantity(holding.total_quantity)} @ avg {formatPrice(holding.avg_cost, holding.asset_type)}
          </Text>
          {pl != null && plPct != null ? (
            <View style={styles.plRow}>
              <Ionicons
                name={positive ? 'caret-up' : 'caret-down'}
                size={10}
                color={plColor}
                style={{ marginRight: 2 }}
              />
              <Text style={[styles.plText, { color: plColor }]}>
                {formatPrice(Math.abs(pl))} ({formatPercent(plPct)})
              </Text>
            </View>
          ) : holding.quote_error ? (
            <Text style={styles.errorText}>No live price</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  rowPressed: { backgroundColor: colors.bgElevated },
  accent: { width: 3 },
  body: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  symbolBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  symbol: { ...type.title, color: colors.text },
  typeChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipText: { fontSize: 9, fontWeight: '700', color: colors.textDim, letterSpacing: 0.5 },
  value: { ...type.heading, color: colors.text, fontVariant: ['tabular-nums' as const] },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subText: { ...type.caption, color: colors.textMuted },
  plRow: { flexDirection: 'row', alignItems: 'center' },
  plText: { ...type.caption, fontVariant: ['tabular-nums' as const] },
  errorText: { ...type.micro, color: colors.textDim },
});
