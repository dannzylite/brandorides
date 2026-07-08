export const Colors = {
  primary: '#1B4332',
  primaryLight: '#52B788',
  primaryPale: '#D8F3DC',
  accent: '#F4A261',
  danger: '#E63946',
  background: '#F9FAFB',
  card: '#FFFFFF',
  text: '#1A1A2E',
  subtext: '#6B7280',
  inputBackground: '#F3F4F6',
  tabInactive: '#9CA3AF',
  border: '#E5E7EB',
  white: '#FFFFFF',
}

export const StatusColors = {
  success: Colors.primaryLight,
  warning: Colors.accent,
  danger: Colors.danger,
  info: '#4A90D9',
  neutral: '#9CA3AF',
}

export const Typography = {
  hero: { fontSize: 32, fontWeight: '800' as const, lineHeight: 40 },
  h1: { fontSize: 24, fontWeight: '700' as const, lineHeight: 30 },
  h2: { fontSize: 20, fontWeight: '700' as const, lineHeight: 26 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  caption: { fontSize: 14, fontWeight: '400' as const, lineHeight: 18 },
  micro: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
}

export const Radii = {
  input: 10,
  button: 12,
  card: 16,
  pill: 999,
}

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
}

export const MinSizes = {
  touchTarget: 44,
  buttonHeight: 52,
  listItemHeight: 64,
}
