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
  title: { color: 'text', fontSize: 34, fontWeight: '600', lineHeight: 40 },
  label: { color: 'muted', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.8 },
  heroTitle: { color: 'text', fontSize: 44, fontWeight: '600', lineHeight: 50 },
  heroSubtitle: { color: 'muted', fontSize: 16, lineHeight: 22 },
  caption: { color: 'muted', fontSize: 13 },
};

export const lightTheme = createTheme({
  colors: {
    background: '#f8f6f1',
    surface: '#fdfcf8',
    elevated: '#ffffff',
    text: '#1d1d19',
    accent: '#0f766e',
    accentMuted: '#badbd5',
    accentContrast: '#faf8f2',
    subtleBg: 'rgba(29,29,25,0.04)',
    border: 'rgba(29,29,25,0.14)',
    overlayDim: 'rgba(13,16,18,0.55)',
    muted: '#6f6b63',
    danger: '#c8553d',
    success: '#2e7a5b',
    cardShadow: 'rgba(13,13,10,0.08)',
    softSurface: '#efece3',
  },
  spacing,
  borderRadii: radii,
  textVariants,
});

export const darkTheme = createTheme({
  ...lightTheme,
  colors: {
    background: '#050607',
    surface: '#0b0d10',
    elevated: '#13161c',
    text: '#f5f4ed',
    accent: '#67d6c6',
    accentMuted: '#3a7e76',
    accentContrast: '#040505',
    subtleBg: 'rgba(245,244,237,0.08)',
    border: 'rgba(245,244,237,0.12)',
    overlayDim: 'rgba(0,0,0,0.7)',
    muted: '#b4b8b9',
    danger: '#ff907d',
    success: '#6ee7b7',
    cardShadow: 'rgba(0,0,0,0.32)',
    softSurface: '#111318',
  },
  spacing,
  borderRadii: radii,
  textVariants,
});

export type Theme = typeof lightTheme;
export const Box = createBox<Theme>();
export const Text = createText<Theme>();
