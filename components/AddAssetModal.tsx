import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AssetSearchResult, AssetType } from '../lib/api';
import { AssetSearchPicker } from './AssetSearchPicker';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: {
    symbol: string;
    asset_type: AssetType;
    display_name?: string;
    external_id?: string;
    logo_url?: string;
  }) => Promise<void>;
}

type Mode = 'search' | 'manual';

const TYPES: { value: AssetType; label: string }[] = [
  { value: 'crypto', label: 'Crypto' },
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
];

export function AddAssetModal({ visible, onClose, onSubmit }: Props) {
  const [mode, setMode] = useState<Mode>('search');
  const [selected, setSelected] = useState<AssetSearchResult | null>(null);
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualType, setManualType] = useState<AssetType>('crypto');
  const [manualName, setManualName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (): void => {
    setMode('search');
    setSelected(null);
    setManualSymbol('');
    setManualType('crypto');
    setManualName('');
    setError(null);
    setBusy(false);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const submitSearched = async (): Promise<void> => {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        symbol: selected.symbol,
        asset_type: selected.asset_type,
        display_name: selected.name,
        external_id: selected.external_id ?? undefined,
        logo_url: selected.logo_url ?? undefined,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to watchlist');
    } finally {
      setBusy(false);
    }
  };

  const submitManual = async (): Promise<void> => {
    if (!manualSymbol.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        symbol: manualSymbol.trim().toUpperCase(),
        asset_type: manualType,
        display_name: manualName.trim() || undefined,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to watchlist');
    } finally {
      setBusy(false);
    }
  };

  const submit = mode === 'search' ? submitSearched : submitManual;
  const canSubmit = mode === 'search' ? !!selected : !!manualSymbol.trim();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>
                {mode === 'search' ? 'Add to watchlist' : 'Add manually'}
              </Text>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            {mode === 'search' ? (
              <AssetSearchPicker
                autoFocus
                selected={selected}
                onSelect={setSelected}
                onManualEntry={() => setMode('manual')}
              />
            ) : (
              <View style={styles.manualForm}>
                <Pressable onPress={() => setMode('search')} style={styles.backLink}>
                  <Ionicons name="arrow-back" size={14} color={colors.accent} />
                  <Text style={styles.backLinkText}>Back to search</Text>
                </Pressable>

                <View style={styles.field}>
                  <Text style={styles.label}>SYMBOL</Text>
                  <TextInput
                    style={styles.input}
                    value={manualSymbol}
                    onChangeText={setManualSymbol}
                    placeholder="BTC, AAPL, SPY…"
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={20}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>TYPE</Text>
                  <View style={styles.segmented}>
                    {TYPES.map((t) => (
                      <Pressable
                        key={t.value}
                        onPress={() => setManualType(t.value)}
                        style={[styles.segment, manualType === t.value && styles.segmentActive]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            manualType === t.value && styles.segmentTextActive,
                          ]}
                        >
                          {t.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>DISPLAY NAME (OPTIONAL)</Text>
                  <TextInput
                    style={styles.input}
                    value={manualName}
                    onChangeText={setManualName}
                    placeholder="e.g. NVIDIA"
                    placeholderTextColor={colors.textDim}
                    maxLength={120}
                  />
                </View>

                {manualType === 'crypto' ? (
                  <View style={styles.hintBox}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textDim} />
                    <Text style={styles.hintText}>
                      For crypto, search is more reliable — it saves the CoinGecko ID so quotes work.
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={() => void submit()}
              disabled={busy || !canSubmit}
              style={({ pressed }) => [
                styles.button,
                (busy || !canSubmit) && styles.buttonDisabled,
                pressed && !busy && canSubmit && styles.buttonPressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.buttonText}>
                  {selected ? `Add ${selected.symbol}` : 'Add to watchlist'}
                </Text>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  center: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  title: { ...type.title, color: colors.text },
  manualForm: { gap: spacing.lg },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  backLinkText: { ...type.caption, color: colors.accent, fontWeight: '600' },
  field: { gap: spacing.sm },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8 },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  segment: { flex: 1, paddingVertical: spacing.md - 2, alignItems: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { ...type.caption, color: colors.textMuted },
  segmentTextActive: { color: colors.bg, fontWeight: '600' },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
  },
  hintText: { ...type.micro, color: colors.textDim, flex: 1, lineHeight: 16 },
  error: { ...type.caption, color: colors.negative },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { ...type.heading, color: colors.bg },
});
