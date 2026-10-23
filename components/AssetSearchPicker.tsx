import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient, ApiError, type AssetSearchResult, type AssetType } from '../lib/api';
import { AssetLogo } from './AssetLogo';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  /** Limit results to a subset of asset types. Default: all. */
  types?: AssetType[];
  /** Auto-focus the search input on mount. */
  autoFocus?: boolean;
  /** Currently selected asset (drives the highlighted state). */
  selected?: AssetSearchResult | null;
  onSelect: (asset: AssetSearchResult) => void;
  /** Optional placeholder override. */
  placeholder?: string;
  /** Optional callback when user wants to switch to manual entry. */
  onManualEntry?: () => void;
}

const TYPE_LABEL: Record<AssetType, string> = {
  crypto: 'CRYPTO',
  stock: 'STOCK',
  etf: 'ETF',
};

const TYPE_COLOR: Record<AssetType, string> = {
  crypto: '#22c55e',
  stock: '#7c8cff',
  etf: '#a855f7',
};

export function AssetSearchPicker({
  types,
  autoFocus,
  selected,
  onSelect,
  placeholder = 'Search by name or symbol (BTC, Apple, Pepe…)',
  onManualEntry,
}: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<AssetSearchResult[] | null>(null);
  const [sources, setSources] = useState<{ coingecko: boolean; finnhub: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(0);

  // Debounce: only fire after the user pauses for 250ms
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery('');
      return;
    }
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults(null);
      setSources(null);
      setError(null);
      setLoading(false);
      return;
    }
    const requestId = ++inflightRef.current;
    setLoading(true);
    setError(null);
    apiClient
      .searchAssets(debouncedQuery, types)
      .then((res) => {
        if (requestId !== inflightRef.current) return;
        setResults(res.results);
        setSources(res.sources);
        setLoading(false);
      })
      .catch((err) => {
        if (requestId !== inflightRef.current) return;
        setError(err instanceof ApiError || err instanceof Error ? err.message : 'Search failed');
        setLoading(false);
      });
  }, [debouncedQuery, types]);

  return (
    <View style={styles.root}>
      <View style={styles.inputRow}>
        <Ionicons name="search" size={16} color={colors.textDim} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={autoFocus}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textDim} />
          </Pressable>
        ) : null}
      </View>

      {sources && !sources.finnhub && (!types || types.includes('stock') || types.includes('etf')) ? (
        <View style={styles.warningBanner}>
          <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.warningText}>
            Stock/ETF search needs a Finnhub key. Showing crypto results only.
          </Text>
        </View>
      ) : null}

      <View style={styles.resultsContainer}>
        {!debouncedQuery ? (
          <EmptyHint onManualEntry={onManualEntry} />
        ) : loading ? (
          <View style={styles.statusBox}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.statusText}>Searching…</Text>
          </View>
        ) : error ? (
          <View style={styles.statusBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.statusText}>{error}</Text>
          </View>
        ) : !results || results.length === 0 ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>No matches for "{debouncedQuery}".</Text>
            {onManualEntry ? (
              <Pressable onPress={onManualEntry}>
                <Text style={styles.manualLink}>Add manually by symbol →</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <ScrollView
            style={styles.resultsList}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {results.map((r) => {
              const isSelected =
                selected?.symbol === r.symbol &&
                selected?.asset_type === r.asset_type &&
                selected?.external_id === r.external_id;
              return (
                <Pressable
                  key={`${r.source}-${r.symbol}-${r.external_id ?? r.exchange ?? ''}`}
                  onPress={() => onSelect(r)}
                  style={({ pressed }) => [
                    styles.resultRow,
                    isSelected && styles.resultRowSelected,
                    pressed && !isSelected && styles.resultRowPressed,
                  ]}
                >
                  <AssetLogo symbol={r.symbol} logoUrl={r.logo_url} assetType={r.asset_type} size={28} />
                  <View style={styles.resultMain}>
                    <View style={styles.resultTopRow}>
                      <Text style={styles.resultSymbol}>{r.symbol}</Text>
                      <View
                        style={[styles.typePill, { backgroundColor: `${TYPE_COLOR[r.asset_type]}22` }]}
                      >
                        <Text style={[styles.typePillText, { color: TYPE_COLOR[r.asset_type] }]}>
                          {TYPE_LABEL[r.asset_type]}
                        </Text>
                      </View>
                      {r.rank != null && r.rank <= 100 ? (
                        <Text style={styles.rankBadge}>#{r.rank}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {r.name}
                    </Text>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function EmptyHint({ onManualEntry }: { onManualEntry?: () => void }) {
  return (
    <View style={styles.statusBox}>
      <Text style={styles.statusText}>
        Try names like "Bitcoin", "S&amp;P 500", "Pepe", or tickers like "AAPL".
      </Text>
      {onManualEntry ? (
        <Pressable onPress={onManualEntry}>
          <Text style={styles.manualLink}>Or add manually by symbol →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  warningText: { ...type.micro, color: colors.warning, flex: 1 },
  resultsContainer: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    minHeight: 80,
    overflow: 'hidden',
  },
  resultsList: { maxHeight: 280 },
  statusBox: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  manualLink: { ...type.caption, color: colors.accent, fontWeight: '600', marginTop: spacing.xs },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.md,
  },
  resultRowPressed: { backgroundColor: colors.bgElevated },
  resultRowSelected: { backgroundColor: 'rgba(124, 140, 255, 0.10)' },
  resultMain: { flex: 1, gap: 2 },
  resultTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultSymbol: { ...type.caption, color: colors.text, fontWeight: '700', fontSize: 14 },
  typePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  typePillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  rankBadge: { ...type.micro, color: colors.textDim },
  resultName: { ...type.micro, color: colors.textMuted, fontSize: 12 },
});
