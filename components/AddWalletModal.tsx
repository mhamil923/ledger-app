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
import type { WalletChain } from '../lib/api';
import { colors, radius, spacing, type } from '../theme/colors';

const CHAINS: { id: WalletChain; label: string; symbol: string }[] = [
  { id: 'ethereum', label: 'Ethereum', symbol: 'ETH' },
  { id: 'polygon', label: 'Polygon', symbol: 'MATIC' },
  { id: 'arbitrum', label: 'Arbitrum', symbol: 'ETH' },
  { id: 'base', label: 'Base', symbol: 'ETH' },
  { id: 'bitcoin', label: 'Bitcoin', symbol: 'BTC' },
  { id: 'solana', label: 'Solana', symbol: 'SOL' },
];

const ADDRESS_PLACEHOLDER: Record<WalletChain, string> = {
  ethereum: '0x…',
  polygon: '0x…',
  arbitrum: '0x…',
  base: '0x…',
  bitcoin: 'bc1… or 1… / 3…',
  solana: 'base58 address',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { label: string; chain: WalletChain; address: string }) => Promise<void>;
}

export function AddWalletModal({ visible, onClose, onSubmit }: Props) {
  const [label, setLabel] = useState('');
  const [chain, setChain] = useState<WalletChain>('ethereum');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (): void => {
    setLabel('');
    setChain('ethereum');
    setAddress('');
    setError(null);
    setBusy(false);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const submit = async (): Promise<void> => {
    if (!label.trim() || !address.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ label: label.trim(), chain, address: address.trim() });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add wallet');
    } finally {
      setBusy(false);
    }
  };

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
                <Text style={styles.eyebrow}>WATCH-ONLY</Text>
                <Text style={styles.title}>Add wallet</Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.field}>
                <Text style={styles.label}>LABEL</Text>
                <TextInput
                  style={styles.input}
                  value={label}
                  onChangeText={setLabel}
                  placeholder="Main wallet, cold storage…"
                  placeholderTextColor={colors.textDim}
                  maxLength={120}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>CHAIN</Text>
                <View style={styles.chainGrid}>
                  {CHAINS.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setChain(c.id)}
                      style={[styles.chainOption, chain === c.id && styles.chainOptionActive]}
                    >
                      <Text style={[styles.chainOptionLabel, chain === c.id && styles.chainOptionLabelActive]}>
                        {c.label}
                      </Text>
                      <Text style={[styles.chainOptionSymbol, chain === c.id && styles.chainOptionSymbolActive]}>
                        {c.symbol}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>ADDRESS</Text>
                <TextInput
                  style={[styles.input, styles.addressInput]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder={ADDRESS_PLACEHOLDER[chain]}
                  placeholderTextColor={colors.textDim}
                  autoCorrect={false}
                  autoCapitalize="none"
                  multiline={chain === 'solana'}
                />
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="lock-closed-outline" size={14} color={colors.textDim} />
                <Text style={styles.infoText}>
                  Read-only. We never ask for private keys, seed phrases, or signing access.
                </Text>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                onPress={() => void submit()}
                disabled={busy || !label.trim() || !address.trim()}
                style={({ pressed }) => [
                  styles.button,
                  (busy || !label.trim() || !address.trim()) && styles.buttonDisabled,
                  pressed && !busy && styles.buttonPressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.buttonText}>Add wallet</Text>
                )}
              </Pressable>
            </ScrollView>
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
    maxHeight: '92%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  eyebrow: { ...type.micro, color: colors.accent },
  title: { ...type.title, color: colors.text },
  scroll: {},
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
    fontSize: 15,
  },
  addressInput: { fontFamily: 'monospace', fontSize: 13, minHeight: 48 },
  chainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chainOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  chainOptionActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chainOptionLabel: { ...type.caption, color: colors.textMuted },
  chainOptionLabelActive: { color: colors.bg, fontWeight: '600' },
  chainOptionSymbol: { ...type.micro, color: colors.textDim },
  chainOptionSymbolActive: { color: 'rgba(10,10,11,0.7)' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.lg,
  },
  infoText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 18 },
  error: { ...type.caption, color: colors.negative, marginBottom: spacing.md },
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
