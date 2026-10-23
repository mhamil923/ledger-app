export const colors = {
  bg: '#0a0a0b',
  bgElevated: '#141416',
  bgCard: '#18181b',
  border: '#26262b',
  borderSubtle: '#1f1f23',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  textDim: '#71717a',
  accent: '#7c8cff',
  accentDim: '#3d4470',
  positive: '#22c55e',
  negative: '#ef4444',
  warning: '#f59e0b',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
} as const;

export const type = {
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  micro: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.5 },
  mono: { fontSize: 15, fontWeight: '500' as const },
} as const;
