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
  const softSurface = palette.softSurface ?? palette.surface;
  const borderColor = palette.border;

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
    <Box style={styles.sectionBlock}>
      <Box style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {actionLabel && onAction && (
          <Pressable
            onPress={onAction}
            disabled={disabled}
            style={({ pressed }) => [
              styles.textButton,
              {
                borderColor,
                backgroundColor: pressed ? palette.subtleBg : 'transparent',
                opacity: disabled ? 0.4 : 1,
              },
            ]}
          >
            <Text style={{ color: muted }}>{actionLabel}</Text>
          </Pressable>
        )}
      </Box>
      <Box style={[styles.sectionRule, { backgroundColor: borderColor }]} />
    </Box>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <Box style={[styles.emptyState, { borderColor, backgroundColor: palette.subtleBg }]}>
      <Box style={[styles.emptyDot, { backgroundColor: accent }]} />
      <Text variant="defaultSemiBold" style={{ color: muted }}>
        {message}
      </Text>
    </Box>
  );

  const renderPageCard = (page: SavedPage, context: 'recent' | 'saved') => {
    const isOnline = page.mode === 'online';
    const badge =
      context === 'recent'
        ? { label: 'Recent', tone: accent }
        : isOnline
          ? { label: 'Online', tone: palette.accentMuted || accent }
          : { label: 'Offline', tone: palette.success };
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
            borderColor,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <Box style={[styles.pageMarker, { backgroundColor: badge.tone }]} />
        <Box style={styles.pageMeta}>
          <Box style={styles.pageHeaderRow}>
            <Text style={styles.pageTitle} numberOfLines={1}>
              {page.title || page.url}
            </Text>
            <Text style={[styles.pageBadge, { color: badge.tone }]}>{badge.label}</Text>
          </Box>
          <Text variant="caption" numberOfLines={1} style={{ color: muted }}>
            {page.url}
          </Text>
          {subtitle ? (
            <Text variant="caption" style={{ color: muted }}>
              {subtitle}
            </Text>
          ) : null}
        </Box>
        {context === 'saved' ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              void onDelete();
            }}
            style={({ pressed }) => [
              styles.removeButton,
              {
                borderColor,
                backgroundColor: pressed ? palette.subtleBg : 'transparent',
              },
            ]}
          >
            <Text style={{ color: palette.danger }}>Remove</Text>
          </Pressable>
        ) : (
          <Text style={[styles.pageChevron, { color: muted }]}>›</Text>
        )}
      </Pressable>
    );
  };

  return (
    <Box flex={1} backgroundColor="background">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Box style={styles.screenPadding}>
          <Box style={[styles.hero, { backgroundColor: softSurface, borderColor }]}>
            <Box style={styles.heroCopy}>
              <Text variant="label" style={{ color: muted }}>
                Web Cache
              </Text>
              <Text variant="heroTitle" style={styles.heroTitle}>
                Keep the web close.
              </Text>
              <Text variant="heroSubtitle" style={{ color: muted }}>
                Store the heavy reads you care about in a calm library. Two-finger tap inside the browser to reveal controls.
              </Text>
            </Box>
            <Box style={[styles.statTile, { borderColor, backgroundColor: palette.surface }]}>
              <Text style={styles.statValue}>{savedCount}</Text>
              <Text variant="caption" style={{ color: muted }}>
                saved
              </Text>
            </Box>
          </Box>

          <Box style={[styles.card, { backgroundColor: palette.surface, borderColor }]}>
            <Box style={styles.cardHeader}>
              <Text variant="label" style={{ color: muted }}>
                New capture
              </Text>
              <Text variant="caption" style={{ color: muted }}>
                Paste or type a URL
              </Text>
            </Box>
            <Box style={[styles.inputShell, { borderColor, backgroundColor: bgInput }]}>
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
              <Pressable
                onPress={openUrl}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: accent, opacity: pressed ? 0.9 : 1 },
                ]}
              >
                <Text style={{ color: accentContrast, fontWeight: '600' }}>Open</Text>
              </Pressable>
            </Box>
            <Text variant="caption" style={{ color: muted, marginTop: 8 }}>
              Pages open in a distraction-free view so you can save them offline or keep a lightweight bookmark.
            </Text>
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
    paddingTop: 32,
    paddingBottom: 40,
  },
  screenPadding: {
    paddingHorizontal: 20,
  },
  hero: {
    flexDirection: 'row',
    gap: 20,
    padding: 24,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  heroCopy: {
    flex: 1,
    gap: 10,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '600',
  },
  statTile: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    minWidth: 96,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 32,
  },
  card: {
    borderRadius: 28,
    padding: 22,
    marginTop: 28,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    height: 56,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    paddingVertical: 0,
  },
  primaryButton: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBlock: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionRule: {
    height: 1,
    opacity: 0.35,
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
    borderRadius: 22,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  pageCard: {
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  pageMarker: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  pageMeta: {
    flex: 1,
    gap: 4,
  },
  pageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pageTitle: {
    fontWeight: '600',
    fontSize: 17,
    flex: 1,
  },
  pageBadge: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  removeButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pageChevron: {
    fontSize: 26,
    lineHeight: 26,
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
