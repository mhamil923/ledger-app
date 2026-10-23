import { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, type HeaderAction } from '../../components/ScreenHeader';
import { WatchlistRow } from '../../components/WatchlistRow';
import { AddAssetModal } from '../../components/AddAssetModal';
import { AnalysisModal } from '../../components/AnalysisModal';
import { LivePulse } from '../../components/LivePulse';
import { apiClient, type WatchlistItem } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors, radius, spacing, type } from '../../theme/colors';
import { formatRelativeTime } from '../../lib/format';

export default function WatchlistScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState<WatchlistItem | null>(null);
  const [editMode, setEditMode] = useState(false);

  const watchlistQuery = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => apiClient.getWatchlist(true),
    // Auto-update prices every 15s for a "live" feel. Pauses during reorder
    // mode + when the tab isn't visible (React Query default behavior).
    refetchInterval: editMode ? false : 15_000,
    refetchIntervalInBackground: false,
  });

  useFocusEffect(
    useCallback(() => {
      void watchlistQuery.refetch();
    }, [watchlistQuery]),
  );

  const addMutation = useMutation({
    mutationFn: apiClient.addWatchlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  });

  const removeMutation = useMutation({
    mutationFn: apiClient.removeWatchlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: apiClient.reorderWatchlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  });

  const items = watchlistQuery.data?.items ?? [];

  const handleRemove = (item: WatchlistItem): void => {
    const message = `Remove ${item.symbol} from your watchlist?`;
    const proceed = (): void => removeMutation.mutate(item.id);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) proceed();
      return;
    }
    Alert.alert('Remove from watchlist', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: proceed },
    ]);
  };

  const moveItem = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    const tmp = next[index];
    const other = next[target];
    if (!tmp || !other) return;
    next[index] = other;
    next[target] = tmp;
    // Optimistic update
    queryClient.setQueryData<{ items: WatchlistItem[] }>(['watchlist'], { items: next });
    reorderMutation.mutate(next.map((i) => i.id));
  };

  const headerActions = useMemo<HeaderAction[]>(() => {
    if (items.length === 0) {
      return [
        { icon: 'settings-outline', onPress: () => router.push('/settings') },
        { icon: 'add', onPress: () => setAddOpen(true) },
      ];
    }
    if (editMode) {
      return [
        { icon: 'checkmark', onPress: () => setEditMode(false), active: true },
      ];
    }
    return [
      { icon: 'create-outline', onPress: () => setEditMode(true) },
      { icon: 'settings-outline', onPress: () => router.push('/settings') },
      { icon: 'add', onPress: () => setAddOpen(true) },
    ];
  }, [editMode, items.length, router]);

  const subtitle = (() => {
    if (editMode) return 'Reorder or remove · tap ✓ when done';
    const lastUpdate = items.find((i) => i.quote)?.quote?.ts;
    if (lastUpdate) return `Updated ${formatRelativeTime(lastUpdate)}`;
    if (items.length > 0) return 'Updating…';
    return 'Track what you care about';
  })();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        eyebrow={user?.email ?? 'WATCHLIST'}
        title="Watchlist"
        subtitle={subtitle}
        subtitleAdornment={
          !editMode && items.length > 0 ? <LivePulse active /> : undefined
        }
        actions={headerActions}
      />

      {watchlistQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : watchlistQuery.isError ? (
        <ErrorBlock
          message={
            watchlistQuery.error instanceof Error
              ? watchlistQuery.error.message
              : 'Could not load watchlist'
          }
          onRetry={() => void watchlistQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : editMode ? (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item, index }) => (
            <EditRow
              item={item}
              canUp={index > 0}
              canDown={index < items.length - 1}
              onUp={() => moveItem(index, -1)}
              onDown={() => moveItem(index, 1)}
              onRemove={() => handleRemove(item)}
            />
          )}
        />
      ) : (
        <FlatList
          data={buildFlatSections(items)}
          keyExtractor={(row) => (row.kind === 'header' ? `h-${row.label}` : row.item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => {
            if (item.kind === 'header') {
              return (
                <View
                  style={[
                    styles.sectionHeader,
                    index === 0 && styles.sectionHeaderFirst,
                  ]}
                >
                  <Text style={styles.sectionLabel}>{item.label}</Text>
                  <Text style={styles.sectionCount}>{item.count}</Text>
                </View>
              );
            }
            return (
              <View style={styles.itemWrap}>
                <WatchlistRow item={item.item} onPress={setAnalyzing} onLongPress={handleRemove} />
              </View>
            );
          }}
          ListFooterComponent={
            <Text style={styles.hint}>
              Tap a row for AI analysis · pencil icon to reorder or remove
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={watchlistQuery.isFetching && !watchlistQuery.isLoading}
              onRefresh={() => void watchlistQuery.refetch()}
              tintColor={colors.accent}
            />
          }
        />
      )}

      <AddAssetModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          await addMutation.mutateAsync(input);
        }}
      />

      <AnalysisModal
        visible={!!analyzing}
        item={analyzing}
        onClose={() => setAnalyzing(null)}
      />
    </SafeAreaView>
  );
}

type FlatRow =
  | { kind: 'header'; label: string; count: number; key: string }
  | { kind: 'item'; item: WatchlistItem };

const SECTION_ORDER: Array<{ type: WatchlistItem['asset_type']; label: string }> = [
  { type: 'crypto', label: 'Crypto' },
  { type: 'stock', label: 'Stocks' },
  { type: 'etf', label: 'ETFs' },
];

function buildFlatSections(items: WatchlistItem[]): FlatRow[] {
  const buckets = new Map<string, WatchlistItem[]>();
  for (const item of items) {
    const arr = buckets.get(item.asset_type) ?? [];
    arr.push(item);
    buckets.set(item.asset_type, arr);
  }
  const rows: FlatRow[] = [];
  for (const section of SECTION_ORDER) {
    const bucket = buckets.get(section.type);
    if (!bucket || bucket.length === 0) continue;
    rows.push({ kind: 'header', label: section.label, count: bucket.length, key: section.type });
    for (const item of bucket) rows.push({ kind: 'item', item });
  }
  return rows;
}

function EditRow({
  item,
  canUp,
  canDown,
  onUp,
  onDown,
  onRemove,
}: {
  item: WatchlistItem;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.reorderRow}>
      <View style={styles.reorderLeft}>
        <Text style={styles.reorderSymbol}>{item.symbol}</Text>
        {item.display_name ? (
          <Text style={styles.reorderName}>{item.display_name}</Text>
        ) : null}
      </View>
      <View style={styles.reorderActions}>
        <Pressable
          onPress={onUp}
          disabled={!canUp}
          style={({ pressed }) => [
            styles.reorderBtn,
            !canUp && styles.reorderBtnDisabled,
            pressed && canUp && styles.reorderBtnPressed,
          ]}
        >
          <Ionicons name="chevron-up" size={20} color={canUp ? colors.text : colors.textDim} />
        </Pressable>
        <Pressable
          onPress={onDown}
          disabled={!canDown}
          style={({ pressed }) => [
            styles.reorderBtn,
            !canDown && styles.reorderBtnDisabled,
            pressed && canDown && styles.reorderBtnPressed,
          ]}
        >
          <Ionicons name="chevron-down" size={20} color={canDown ? colors.text : colors.textDim} />
        </Pressable>
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [
            styles.removeBtn,
            pressed && styles.removeBtnPressed,
          ]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.negative} />
        </Pressable>
      </View>
    </View>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="trending-up" size={28} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>Your watchlist is empty</Text>
      <Text style={styles.emptyDesc}>
        Add stocks, ETFs, or crypto to get live prices and on-tap AI analysis.
      </Text>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}
      >
        <Ionicons name="add" size={18} color={colors.bg} />
        <Text style={styles.emptyButtonText}>Add an asset</Text>
      </Pressable>
    </View>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>Couldn't load watchlist</Text>
      <Text style={styles.emptyDesc}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.emptyButton}>
        <Text style={styles.emptyButtonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  separator: { height: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionHeaderFirst: { marginTop: 0 },
  sectionLabel: {
    ...type.micro,
    color: colors.textMuted,
    letterSpacing: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionCount: {
    ...type.micro,
    color: colors.textDim,
    fontSize: 10,
    fontVariant: ['tabular-nums' as const],
  },
  itemWrap: { marginBottom: spacing.sm },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(124, 140, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { ...type.title, color: colors.text },
  emptyDesc: {
    ...type.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  emptyButtonPressed: { opacity: 0.85 },
  emptyButtonText: { ...type.heading, color: colors.bg },
  hint: {
    ...type.micro,
    color: colors.textDim,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reorderLeft: { flex: 1, gap: 2 },
  reorderSymbol: { ...type.heading, color: colors.text },
  reorderName: { ...type.micro, color: colors.textMuted },
  reorderActions: { flexDirection: 'row', gap: 6 },
  reorderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnDisabled: { opacity: 0.35 },
  reorderBtnPressed: { backgroundColor: colors.accentDim },
  removeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  removeBtnPressed: { backgroundColor: 'rgba(239, 68, 68, 0.16)' },
});
