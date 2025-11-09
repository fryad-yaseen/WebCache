import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@shopify/restyle';
import * as Haptics from 'expo-haptics';

import { Box, Text, type Theme } from '@/theme/restyle';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SavedPage } from '@/lib/cache';
import { clearRecentOpens, listSavedPages, markPageOpened, removeSavedPage } from '@/lib/cache';
import { MAX_CACHE_ENTRIES, preloadPageHtml } from '@/lib/page-html-cache';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const palette = useTheme<Theme>().colors;

  const [input, setInput] = useState('');
  const [pages, setPages] = useState<SavedPage[]>([]);
  const [clearingRecents, setClearingRecents] = useState(false);

  const bgInput = palette.subtleBg;
  const placeholder = colorScheme === 'dark' ? 'rgba(248,250,252,0.6)' : 'rgba(15,23,42,0.45)';
  const accent = palette.accent;
  const accentContrast = palette.accentContrast ?? '#fff';
  const muted = palette.muted;

  const pulse = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  async function refresh() {
    setPages(await listSavedPages());
  }

  useEffect(() => {
    refresh();
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      refresh();
      return () => {};
    }, [])
  );

  function openUrl() {
    const url = normalizeUrl(input);
    if (!url) return;
    pulse();
    router.push({ pathname: '/browser', params: { url } });
  }

  useEffect(() => {
    const maxToWarm = Math.min(MAX_CACHE_ENTRIES, pages.length);
    pages.slice(0, maxToWarm).forEach((page) => {
      preloadPageHtml(page);
    });
  }, [pages]);

  const openSavedPage = useCallback((page: SavedPage) => {
    pulse();
    preloadPageHtml(page);
    const openedAt = Date.now();
    markPageOpened(page.id).catch(() => {});
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, lastOpenedAt: openedAt } : p)));
    try {
      const payload = encodeURIComponent(JSON.stringify(page));
      router.push({ pathname: '/browser', params: { id: page.id, page: payload } });
    } catch {
      router.push({ pathname: '/browser', params: { id: page.id } });
    }
  }, [pulse]);

  const recentPages = useMemo(() => {
    return pages
      .filter((p): p is SavedPage & { lastOpenedAt: number } => typeof p.lastOpenedAt === 'number' && p.lastOpenedAt > 0)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 5);
  }, [pages]);

  const clearRecents = useCallback(async () => {
    if (clearingRecents || recentPages.length === 0) return;
    setClearingRecents(true);
    try {
      await clearRecentOpens();
      pulse();
      setPages((prev) =>
        prev.map((p) => (typeof p.lastOpenedAt === 'number' && p.lastOpenedAt > 0 ? { ...p, lastOpenedAt: null } : p))
      );
    } finally {
      setClearingRecents(false);
    }
  }, [clearingRecents, recentPages.length, pulse]);

  const savedCount = pages.length;

  const SectionHeader = ({
    title,
    actionLabel,
    onAction,
    disabled,
  }: {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
    disabled?: boolean;
  }) => (
    <Box style={styles.sectionHeader}>
      <Text variant="subtitle">{title}</Text>
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          disabled={disabled}
          style={({ pressed }) => [
            styles.textButton,
            { opacity: disabled ? 0.45 : pressed ? 0.75 : 1, borderColor: accent, backgroundColor: `${accent}1a` },
          ]}
        >
          <Text style={{ color: accent }}>{actionLabel}</Text>
        </Pressable>
      )}
    </Box>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <Box style={[styles.emptyState, { borderColor: palette.border, backgroundColor: palette.subtleBg }]}>
      <Text variant="defaultSemiBold">{message}</Text>
    </Box>
  );

  const renderPageCard = (page: SavedPage, context: 'recent' | 'saved') => {
    const isOnline = page.mode === 'online';
    const pill =
      context === 'recent' ? { label: 'Recent', tone: palette.accent } : isOnline ? { label: 'Online', tone: palette.accentMuted } : { label: 'Offline', tone: palette.success };
    const subtitle = context === 'recent' && page.lastOpenedAt ? `Opened ${formatRelativeTime(page.lastOpenedAt)}` : undefined;
    const onDelete = async () => {
      await removeSavedPage(page.id);
      pulse();
      refresh();
    };

    return (
      <Pressable
        key={`${context}-${page.id}`}
        onPress={() => openSavedPage(page)}
        style={({ pressed }) => [
          styles.pageCard,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            shadowColor: palette.cardShadow,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <Box style={styles.pageMeta}>
          <Box style={[styles.pill, { backgroundColor: withAlpha(pill.tone, 0.15) }]}>
            <Text variant="caption" style={{ color: pill.tone }}>
              {pill.label}
            </Text>
          </Box>
          <Text style={styles.pageTitle} numberOfLines={1}>
            {page.title || page.url}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {page.url}
          </Text>
          {subtitle ? (
            <Text variant="caption" style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </Box>
        {context === 'saved' && (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              void onDelete();
            }}
            style={({ pressed }) => [
              styles.iconButton,
              {
                borderColor: palette.border,
                backgroundColor: pressed ? palette.subtleBg : palette.surface,
              },
            ]}
          >
            <Text style={{ color: palette.danger }}>Delete</Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <Box flex={1} backgroundColor="background">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Box style={styles.screenPadding}>
          <Box style={styles.headerRow}>
            <Box style={styles.headerCopy}>
              <Text variant="title">Library</Text>
              <Text variant="caption" style={{ color: muted, marginTop: 4 }}>
                Offline-first cache for the web you care about.
              </Text>
            </Box>
            <Box style={[styles.statTile, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={styles.statValue}>{savedCount}</Text>
              <Text variant="caption" style={{ marginTop: 2 }}>
                Saved
              </Text>
            </Box>
          </Box>

          <Box style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text variant="subtitle">Open URL</Text>
            <Box style={[styles.inputShell, { backgroundColor: bgInput }]}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="https://"
                placeholderTextColor={placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={openUrl}
                style={[styles.input, { color: theme.text }]}
              />
            </Box>
            <Pressable onPress={openUrl} style={({ pressed }) => [styles.primaryButton, { backgroundColor: accent, opacity: pressed ? 0.9 : 1 }]}>
              <Text style={{ color: accentContrast, fontWeight: '600' }}>Go</Text>
            </Pressable>
          </Box>

          <SectionHeader
            title="Recently opened"
            actionLabel={recentPages.length > 0 ? (clearingRecents ? 'Clearing…' : 'Clear history') : undefined}
            onAction={recentPages.length > 0 ? clearRecents : undefined}
            disabled={clearingRecents}
          />
          {recentPages.length === 0 ? <EmptyState message="Open any saved page to populate recents." /> : recentPages.map((p) => renderPageCard(p, 'recent'))}

          <SectionHeader title="Library" />
          {pages.length === 0 ? <EmptyState message="Nothing saved yet. Open a page above and save it in the browser." /> : pages.map((p) => renderPageCard(p, 'saved'))}
        </Box>
      </ScrollView>
    </Box>
  );
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withScheme = /^(https?:)?\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return withScheme;
  }
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: 28,
    paddingBottom: 36,
  },
  screenPadding: {
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  statTile: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 90,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  card: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inputShell: {
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 17,
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  textButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyState: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
  },
  pageCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pageMeta: {
    flex: 1,
    gap: 6,
  },
  pageTitle: {
    fontWeight: '600',
    fontSize: 17,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
  },
  iconButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});

function formatRelativeTime(value: number) {
  if (!value) return '';
  const delta = Date.now() - value;
  if (!Number.isFinite(delta) || delta < 0) {
    return new Date(value).toLocaleString();
  }
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function withAlpha(color: string, alpha: number) {
  const hex = (color || '#000000').replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}
