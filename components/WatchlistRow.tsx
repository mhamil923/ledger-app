import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WatchlistItem } from '../lib/api';
import { AssetLogo } from './AssetLogo';
import { formatPercent, formatPrice } from '../lib/format';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  item: WatchlistItem;
  onPress: (item: WatchlistItem) => void;
  onLongPress: (item: WatchlistItem) => void;
}

export function WatchlistRow({ item, onPress, onLongPress }: Props) {
  const quote = item.quote;
  const positive = quote ? quote.change_pct >= 0 : true;
  const changeColor = quote
    ? quote.change_pct >= 0
      ? colors.positive
      : colors.negative
    : colors.textDim;

  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <AssetLogo
        symbol={item.symbol}
        logoUrl={item.logo_url}
        assetType={item.asset_type}
        size={36}
      />
      <View style={styles.body}>
        <Text style={styles.symbol}>{item.symbol}</Text>
        {item.display_name ? (
          <Text style={styles.name} numberOfLines={1}>
            {item.display_name}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {quote ? (
          <>
            <Text style={styles.price}>{formatPrice(quote.price, item.asset_type)}</Text>
            <View style={styles.changeRow}>
              <Ionicons
                name={positive ? 'caret-up' : 'caret-down'}
                size={10}
                color={changeColor}
                style={{ marginRight: 2 }}
              />
              <Text style={[styles.change, { color: changeColor }]}>
                {formatPercent(quote.change_pct)}
              </Text>
            </View>
          </>
        ) : item.error ? (
          <Text style={styles.errorText} numberOfLines={2}>
            {shortError(item.error)}
          </Text>
        ) : (
          <Text style={styles.placeholder}>—</Text>
        )}
      </View>
    </Pressable>
  );
}

function shortError(err: string): string {
  if (/FINNHUB_API_KEY/i.test(err)) return 'Finnhub key needed';
  if (/COINGECKO/i.test(err)) return 'Crypto quote unavailable';
  if (/Unknown crypto/i.test(err)) return 'Symbol not mapped';
  return 'Quote unavailable';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.md,
  },
  rowPressed: { backgroundColor: colors.bgElevated },
  body: { flex: 1, gap: 2, minWidth: 0 },
  symbol: { ...type.heading, color: colors.text, fontSize: 16 },
  name: { ...type.caption, color: colors.textMuted, fontSize: 12 },
  right: { alignItems: 'flex-end', gap: 2 },
  price: { color: colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums' as const] },
  changeRow: { flexDirection: 'row', alignItems: 'center' },
  change: { ...type.caption, fontVariant: ['tabular-nums' as const], fontSize: 12 },
  errorText: {
    ...type.caption,
    color: colors.textDim,
    textAlign: 'right',
    maxWidth: 120,
    fontSize: 11,
  },
  placeholder: { color: colors.textDim },
});
