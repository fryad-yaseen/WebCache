import { createBox, createText, createTheme } from '@shopify/restyle';

export const lightTheme = createTheme({
  colors: {
    background: '#ffffff',
    text: '#11181C',
    accent: '#0a7ea4',
    subtleBg: 'rgba(0,0,0,0.04)',
    border: 'rgba(0,0,0,0.15)',
    overlayDim: 'rgba(0,0,0,0.35)',
    muted: '#6b7280',
    danger: '#dc2626',
    buttonText: '#ffffff',
  },
  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
  },
  textVariants: {
    defaults: { color: 'text', fontSize: 16 },
    defaultSemiBold: { color: 'text', fontSize: 16, fontWeight: '600' },
    subtitle: { color: 'text', fontSize: 18, fontWeight: '600' },
    title: { color: 'text', fontSize: 32, fontWeight: '700' },
  },
});

export const darkTheme = createTheme({
  ...lightTheme,
  colors: {
    background: '#151718',
    text: '#ECEDEE',
    accent: '#3b82f6',
    subtleBg: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.15)',
    overlayDim: 'rgba(0,0,0,0.5)',
    muted: '#9BA1A6',
    danger: '#ef4444',
    buttonText: '#ffffff',
  },
});

export type Theme = typeof lightTheme;
export const Box = createBox<Theme>();
export const Text = createText<Theme>();
