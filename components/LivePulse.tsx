import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, type } from '../theme/colors';

interface Props {
  active?: boolean;
  label?: string;
  style?: ViewStyle;
}

/**
 * Small pulsing dot + LIVE label. The dot scales up and fades to convey that
 * the data is updating in the background.
 */
export function LivePulse({ active = true, label = 'LIVE', style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      opacity.setValue(0.4);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.6, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale, opacity]);

  return (
    <View style={[styles.root, style]}>
      <View style={styles.dotWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulse,
            { transform: [{ scale }], opacity },
            { backgroundColor: active ? colors.positive : colors.textDim },
          ]}
        />
        <View
          style={[
            styles.dot,
            { backgroundColor: active ? colors.positive : colors.textDim },
          ]}
        />
      </View>
      <Text style={[styles.label, { color: active ? colors.positive : colors.textDim }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: {
    ...type.micro,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
