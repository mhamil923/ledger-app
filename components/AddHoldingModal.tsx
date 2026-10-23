import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AssetSearchResult, AssetType, LotInput } from '../lib/api';
import { AssetSearchPicker } from './AssetSearchPicker';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: {
    symbol: string;
    asset_type: AssetType;
    notes?: string;
    external_id?: string;
    initial_lot?: LotInput;
  }) => Promise<void>;
}

const TYPES: { value: AssetType; label: string }[] = [
  { value: 'crypto', label: 'Crypto' },
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Step = 'pick' | 'lot';
type Source = 'search' | 'manual';

interface PickedAsset {
  symbol: string;
  asset_type: AssetType;
  name?: string;
  external_id?: string | null;
}

export function AddHoldingModal({ visible, onClose, onSubmit }: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [source, setSource] = useState<Source>('search');
  const [searched, setSearched] = useState<AssetSearchResult | null>(null);
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualType, setManualType] = useState<AssetType>('crypto');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (): void => {
    setStep('pick');
    setSource('search');
    setSearched(null);
    setManualSymbol('');
    setManualType('crypto');
    setQuantity('');
    setCost('');
    setDate(todayIso());
    setNotes('');
    setError(null);
    setBusy(false);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const pickedAsset = (): PickedAsset | null => {
    if (source === 'search' && searched) {
      return {
        symbol: searched.symbol,
        asset_type: searched.asset_type,
        name: searched.name,
        external_id: searched.external_id,
      };
    }
    if (source === 'manual' && manualSymbol.trim()) {
      return {
        symbol: manualSymbol.trim().toUpperCase(),
        asset_type: manualType,
      };
    }
    return null;
  };

  const advance = (): void => {
    if (!pickedAsset()) return;
    setError(null);
    setStep('lot');
  };

  const submit = async (): Promise<void> => {
    const asset = pickedAsset();
    if (!asset) return;
    const qtyNum = parseFloat(quantity);
    const costNum = parseFloat(cost);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError('Quantity must be a positive number.');
      return;
    }
    if (!Number.isFinite(costNum) || costNum < 0) {
      setError('Cost must be zero or positive.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date must be YYYY-MM-DD.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        symbol: asset.symbol,
        asset_type: asset.asset_type,
        notes: notes.trim() || undefined,
        external_id: asset.external_id ?? undefined,
        initial_lot: {
          quantity: qtyNum,
          cost_per_unit: costNum,
          acquired_at: date,
        },
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add holding');
    } finally {
      setBusy(false);
    }
  };

  const picked = pickedAsset();
  const canAdvance = !!picked;

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
              <View>
                <Text style={styles.eyebrow}>STEP {step === 'pick' ? '1 / 2' : '2 / 2'}</Text>
                <Text style={styles.title}>
                  {step === 'pick' ? 'Pick the asset' : `Add lot · ${picked?.symbol}`}
                </Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            {step === 'pick' ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.scrollPick}>
                {source === 'search' ? (
                  <>
                    <AssetSearchPicker
                      autoFocus
                      selected={searched}
                      onSelect={setSearched}
                      onManualEntry={() => {
                        setSource('manual');
                        setSearched(null);
                      }}
                    />
                  </>
                ) : (
                  <View style={styles.manualBlock}>
                    <Pressable
                      onPress={() => {
                        setSource('search');
                        setManualSymbol('');
                      }}
                      style={styles.backLink}
                    >
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
                  </View>
                )}
              </ScrollView>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.scrollLot}>
                <Pressable onPress={() => setStep('pick')} style={styles.backLink}>
                  <Ionicons name="arrow-back" size={14} color={colors.accent} />
                  <Text style={styles.backLinkText}>Change asset</Text>
                </Pressable>
                {picked ? (
                  <View style={styles.pickedBadge}>
                    <Text style={styles.pickedSymbol}>{picked.symbol}</Text>
                    <Text style={styles.pickedName} numberOfLines={1}>
                      {picked.name ?? picked.asset_type.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.row}>
                  <View style={[styles.field, styles.flex]}>
                    <Text style={styles.label}>QUANTITY</Text>
                    <TextInput
                      style={styles.input}
                      value={quantity}
                      onChangeText={setQuantity}
                      placeholder="0.5"
                      placeholderTextColor={colors.textDim}
                      keyboardType="decimal-pad"
                      autoFocus
                    />
                  </View>
                  <View style={[styles.field, styles.flex]}>
                    <Text style={styles.label}>COST / UNIT</Text>
                    <TextInput
                      style={styles.input}
                      value={cost}
                      onChangeText={setCost}
                      placeholder="30000"
                      placeholderTextColor={colors.textDim}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>ACQUIRED ON (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={date}
                    onChangeText={setDate}
                    placeholder={todayIso()}
                    placeholderTextColor={colors.textDim}
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>NOTES (OPTIONAL)</Text>
                  <TextInput
                    style={[styles.input, styles.notesInput]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="e.g. taxable account, IRA, cold storage…"
                    placeholderTextColor={colors.textDim}
                    multiline
                    maxLength={2000}
                  />
                </View>
              </ScrollView>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {step === 'pick' ? (
              <Pressable
                onPress={advance}
                disabled={!canAdvance}
                style={({ pressed }) => [
                  styles.button,
                  !canAdvance && styles.buttonDisabled,
                  pressed && canAdvance && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonText}>
                  {picked ? `Continue with ${picked.symbol}` : 'Continue'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void submit()}
                disabled={busy || !quantity.trim() || !cost.trim()}
                style={({ pressed }) => [
                  styles.button,
                  (busy || !quantity.trim() || !cost.trim()) && styles.buttonDisabled,
                  pressed && !busy && styles.buttonPressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.buttonText}>Add holding</Text>
                )}
              </Pressable>
            )}
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
    maxHeight: '92%',
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
  eyebrow: { ...type.micro, color: colors.accent },
  title: { ...type.title, color: colors.text },
  scrollPick: { maxHeight: 380 },
  scrollLot: { maxHeight: 460 },
  manualBlock: { gap: spacing.lg },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: spacing.sm },
  backLinkText: { ...type.caption, color: colors.accent, fontWeight: '600' },
  pickedBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: 'rgba(124, 140, 255, 0.10)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(124, 140, 255, 0.3)',
    marginBottom: spacing.md,
  },
  pickedSymbol: { ...type.heading, color: colors.text },
  pickedName: { ...type.caption, color: colors.textMuted, flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  flex: { flex: 1 },
  field: { gap: spacing.sm, marginBottom: spacing.lg },
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
  notesInput: { minHeight: 60, textAlignVertical: 'top' },
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
