import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '../lib/api';
import { colors, spacing } from '../theme/colors';
import { Sheet, sheetStyles as s } from './Sheet';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Apple Card can't be linked through SimpleFIN, so it comes in as a CSV
 * export from Wallet or card.apple.com. Re-importing overlapping dates is safe.
 */
export function AppleCardImportSheet({ visible, onClose, onImported }: Props) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [owed, setOwed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFile(null);
    setOwed('');
    setError(null);
    setResult(null);
  }, [visible]);

  const pick = async (): Promise<void> => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    try {
      const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
      setFile({ name: asset.name, text });
    } catch {
      setError('Could not read that file.');
    }
  };

  const doImport = async (): Promise<void> => {
    if (!file) return;
    const balance = owed.trim() ? Number(owed.replace(/[$,]/g, '')) : undefined;
    if (balance != null && (!Number.isFinite(balance) || balance < 0)) {
      setError('Enter the balance as a number, like 412.50.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await apiClient.importAppleCard(file.text, balance);
      setResult(
        `Imported ${r.rows} transactions (${r.inserted} new, ${r.updated} already there) from ${r.from} to ${r.to}.` +
          (r.skipped ? ` Skipped ${r.skipped} unreadable rows.` : ''),
      );
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} eyebrow="APPLE CARD" title="Import Apple Card">
      <Text style={s.hint}>
        Apple Card can't connect through SimpleFIN, so export it and import the file here. Do this whenever you want it
        up to date. Overlapping dates won't duplicate anything.
      </Text>
      <View style={s.field}>
        <Text style={s.label}>1. EXPORT FROM APPLE</Text>
        <Text style={s.hint}>
          iPhone: Wallet → Apple Card → Card Balance → Export Transactions → pick dates → CSV.{'\n'}
          Mac: card.apple.com → Statements → Export Transactions → CSV.{'\n'}
          The first time, export everything back to March so your budget history is complete.
        </Text>
      </View>
      <View style={s.field}>
        <Text style={s.label}>2. CHOOSE THE FILE</Text>
        <Pressable onPress={() => void pick()} style={s.secondaryBtn}>
          <Ionicons name={file ? 'document-text' : 'document-attach-outline'} size={16} color={colors.text} />
          <Text style={s.secondaryText} numberOfLines={1}>
            {file ? file.name : 'Choose CSV file'}
          </Text>
        </Pressable>
      </View>
      <View style={s.field}>
        <Text style={s.label}>3. CURRENT BALANCE OWED (OPTIONAL)</Text>
        <View style={s.currencyWrap}>
          <Text style={s.currencyPrefix}>$</Text>
          <TextInput
            value={owed}
            onChangeText={setOwed}
            placeholder="from Wallet → Apple Card"
            placeholderTextColor={colors.textDim}
            keyboardType="decimal-pad"
            style={s.currencyInput}
          />
        </View>
      </View>
      {error ? (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.negative} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}
      {result ? (
        <View style={[s.errorBox, { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }]}>
          <Ionicons name="checkmark-circle" size={14} color={colors.positive} />
          <Text style={[s.errorText, { color: colors.text }]}>{result}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={() => void doImport()}
          disabled={!file || busy}
          style={[s.primaryBtn, { flex: 1 }, (!file || busy) && { opacity: 0.5 }]}
        >
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.primaryText}>Import</Text>}
        </Pressable>
        {result ? (
          <Pressable onPress={onClose} style={[s.secondaryBtn, { flex: 1 }]}>
            <Text style={s.secondaryText}>Done</Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}
