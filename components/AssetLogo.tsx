import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { AssetType } from '../lib/api';
import { colors } from '../theme/colors';

interface Props {
  symbol: string;
  logoUrl?: string | null;
  assetType?: AssetType;
  size?: number;
  style?: ViewStyle;
}

/**
 * Hash a string to one of a fixed palette of colors so the same symbol always
 * lands on the same shade. Used for the letter-circle fallback when no logo
 * loads.
 */
const PALETTE = [
  '#7c8cff', // accent
  '#22c55e', // green
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#ef4444', // red
  '#14b8a6', // teal
  '#eab308', // yellow
  '#3b82f6', // blue
];

function colorFor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) {
    h = (h * 31 + symbol.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

export function AssetLogo({ symbol, logoUrl, size = 32, style }: Props) {
  const [errored, setErrored] = useState(false);
  const showImage = !!logoUrl && !errored;
  const letter = symbol.charAt(0).toUpperCase();
  const bg = colorFor(symbol);

  return (
    <View
      style={[
        styles.root,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: showImage ? colors.bgElevated : bg },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setErrored(true)}
        />
      ) : (
        <Text style={[styles.letter, { fontSize: Math.round(size * 0.45) }]}>{letter}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: {
    color: '#0a0a0b',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
