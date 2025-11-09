import { createBox, createText, createTheme } from '@shopify/restyle';

const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
};

const radii = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
};

const textVariants = {
  defaults: { color: 'text', fontSize: 16, lineHeight: 22 },
  defaultSemiBold: { color: 'text', fontSize: 16, fontWeight: '600', lineHeight: 22 },
  subtitle: { color: 'text', fontSize: 18, fontWeight: '600', lineHeight: 24 },
  title: { color: 'text', fontSize: 34, fontWeight: '700', lineHeight: 40 },
  label: { color: 'muted', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { color: 'text', fontSize: 40, fontWeight: '700', lineHeight: 46 },
  heroSubtitle: { color: 'muted', fontSize: 16, lineHeight: 22 },
  caption: { color: 'muted', fontSize: 13 },
};

export const lightTheme = createTheme({
  colors: {
    background: '#f5f7fb',
    surface: '#ffffff',
    elevated: '#fdfdfd',
    text: '#0f172a',
    accent: '#6366f1',
    accentMuted: '#a5b4fc',
    accentContrast: '#ffffff',
    subtleBg: 'rgba(15,23,42,0.04)',
    border: 'rgba(15,23,42,0.12)',
    overlayDim: 'rgba(15,23,42,0.45)',
    muted: '#6b7280',
    danger: '#ef4444',
    success: '#16a34a',
    cardShadow: 'rgba(15,23,42,0.08)',
  },
  spacing,
  borderRadii: radii,
  textVariants,
});

export const darkTheme = createTheme({
  ...lightTheme,
  colors: {
    background: '#090e1a',
    surface: '#0f172a',
    elevated: '#111b2f',
    text: '#f8fafc',
    accent: '#8b9eff',
    accentMuted: '#7dd3fc',
    accentContrast: '#060b1a',
    subtleBg: 'rgba(148,163,184,0.1)',
    border: 'rgba(148,163,184,0.2)',
    overlayDim: 'rgba(0,0,0,0.65)',
    muted: '#cbd5f5',
    danger: '#fca5a5',
    success: '#4ade80',
    cardShadow: 'rgba(0,0,0,0.4)',
  },
  spacing,
  borderRadii: radii,
  textVariants,
});

export type Theme = typeof lightTheme;
export const Box = createBox<Theme>();
export const Text = createText<Theme>();
