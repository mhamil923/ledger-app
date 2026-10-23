import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (setupToken: string) => Promise<void>;
}

/**
 * Modal that walks the user through connecting their bank via SimpleFIN.
 * The user pastes a one-time Setup Token from bridge.simplefin.org; we ship
 * it to the backend, which redeems it for an Access URL and stores it
 * encrypted. The token is single-use — after submission it's invalid.
 */
export function ConnectBankModal({ visible, onClose, onSubmit }: Props) {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    if (!token.trim()) {
      setError('Paste your Setup Token first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(token.trim());
      setToken('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>CONNECT BANK</Text>
              <Text style={styles.title}>SimpleFIN Bridge</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.infoBox}>
              <View style={styles.infoIcon}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.positive} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.infoTitle}>Read-only access</Text>
                <Text style={styles.infoText}>
                  SimpleFIN can only read balances and transactions. No one — including this app —
                  can move money. We store your access credentials encrypted with AES-256.
                </Text>
              </View>
            </View>

            <View style={styles.stepsCard}>
              <Step n={1}>
                Sign in (or sign up) at{' '}
                <Pressable onPress={() => void Linking.openURL('https://bridge.simplefin.org')}>
                  <Text style={styles.link}>bridge.simplefin.org</Text>
                </Pressable>
                {'  '}— $1.50/mo after a free trial.
              </Step>
              <Step n={2}>Link your banks through the SimpleFIN bridge UI.</Step>
              <Step n={3}>Click "Create a new Setup Token" in your SimpleFIN dashboard.</Step>
              <Step n={4}>Paste the entire token string below. It's one-use only.</Step>
            </View>

            <Text style={styles.label}>Setup Token</Text>
            <TextInput
              value={token}
              onChangeText={(t) => {
                setToken(t);
                if (error) setError(null);
              }}
              placeholder="aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vREVNTw=="
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              style={styles.input}
              editable={!submitting}
            />

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.negative} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void handleSubmit()}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitButton,
                (pressed || submitting) && { opacity: 0.7 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Ionicons name="link" size={16} color={colors.bg} />
                  <Text style={styles.submitText}>Connect and sync</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  backdropPress: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  eyebrow: { ...type.micro, color: colors.accent, letterSpacing: 0.8 },
  title: { ...type.title, color: colors.text, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: spacing.md, paddingBottom: spacing.lg },
  infoBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(76, 217, 100, 0.08)',
    borderColor: 'rgba(76, 217, 100, 0.3)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoIcon: { width: 28, alignItems: 'center', paddingTop: 1 },
  infoTitle: { ...type.heading, color: colors.text, fontSize: 14 },
  infoText: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  stepsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    gap: spacing.sm,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: { ...type.micro, color: colors.text, fontWeight: '700', fontSize: 11 },
  stepText: { ...type.caption, color: colors.textMuted, flex: 1, lineHeight: 19 },
  link: { ...type.caption, color: colors.accent, fontWeight: '600' },
  label: { ...type.micro, color: colors.textMuted, letterSpacing: 0.8, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 96,
    color: colors.text,
    fontSize: 13,
    fontFamily: 'Menlo',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  errorText: { ...type.caption, color: colors.negative, flex: 1 },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  submitText: { ...type.heading, color: colors.bg, fontSize: 15 },
});
