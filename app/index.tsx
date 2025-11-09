import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { Box, Text } from '@/theme/restyle';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SavedPage } from '@/lib/cache';
import { clearRecentOpens, listSavedPages, markPageOpened, removeSavedPage } from '@/lib/cache';
import { MAX_CACHE_ENTRIES, preloadPageHtml } from '@/lib/page-html-cache';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [input, setInput] = useState('');
  const [pages, setPages] = useState<SavedPage[]>([]);
  const [clearingRecents, setClearingRecents] = useState(false);

  const bgInput = colorScheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const borderInput = colorScheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const placeholder = colorScheme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';
  const accent = colorScheme === 'dark' ? '#3b82f6' : Colors.light.tint;

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
    router.push({ pathname: '/browser', params: { url } });
  }

  useEffect(() => {
    const maxToWarm = Math.min(MAX_CACHE_ENTRIES, pages.length);
    pages.slice(0, maxToWarm).forEach((page) => {
      preloadPageHtml(page);
    });
  }, [pages]);

  const openSavedPage = useCallback((page: SavedPage) => {
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
  }, []);

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
      setPages((prev) =>
        prev.map((p) => (typeof p.lastOpenedAt === 'number' && p.lastOpenedAt > 0 ? { ...p, lastOpenedAt: null } : p))
      );
    } finally {
      setClearingRecents(false);
    }
  }, [clearingRecents, recentPages.length]);

  return (
    <Box flex={1} padding={3}>
      <Box flexDirection="row" alignItems="center" style={styles.controlsRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Enter URL to open"
          placeholderTextColor={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={openUrl}
          style={[styles.input, { color: theme.text, borderColor: borderInput, backgroundColor: bgInput }]}
        />
        <Pressable onPress={openUrl} style={({ pressed }) => [styles.button, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}>
          <Text color="buttonText">Open</Text>
        </Pressable>
      </Box>

      <Box flexDirection="row" alignItems="center" justifyContent="space-between" style={{ marginTop: 12, marginBottom: 4 }}>
        <Text variant="subtitle">Recently Opened Pages</Text>
        {recentPages.length > 0 && (
          <Pressable onPress={clearRecents} disabled={clearingRecents} style={({ pressed }) => [
            styles.clearRecentBtn,
            { borderColor: accent, opacity: clearingRecents ? 0.5 : pressed ? 0.85 : 1 },
          ]}>
            <Text style={{ color: accent }}>Clear</Text>
          </Pressable>
        )}
      </Box>
      <Box>
        {recentPages.length === 0 ? (
          <Text color="muted">Open any saved page to see it here.</Text>
        ) : (
          recentPages.map((p) => (
            <Box key={`recent-${p.id}`} flexDirection="row" alignItems="center" paddingVertical={2} borderBottomWidth={StyleSheet.hairlineWidth} borderBottomColor="border" style={{ gap: 8 }}>
              <Box style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontWeight: '600' }}>{p.title || p.url}</Text>
                <Text numberOfLines={1} color="muted" style={{ fontSize: 12 }}>{p.url}</Text>
                <Text numberOfLines={1} color="muted" style={{ fontSize: 11 }}>
                  Last opened {new Date(p.lastOpenedAt).toLocaleString()}
                </Text>
              </Box>
              <Pressable onPress={() => openSavedPage(p)} style={({ pressed }) => [styles.smallBtn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}>
                <Text color="buttonText">Open</Text>
              </Pressable>
            </Box>
          ))
        )}
      </Box>

      <Text variant="subtitle" style={{ marginTop: 20, marginBottom: 4 }}>Saved Pages</Text>
      <Box flex={1}>
        {pages.length === 0 ? (
          <Text color="muted">No saved pages yet.</Text>
        ) : (
          pages.map((p) => (
            <Box key={p.id} flexDirection="row" alignItems="center" paddingVertical={2} borderBottomWidth={StyleSheet.hairlineWidth} borderBottomColor="border" style={{ gap: 8 }}>
              <Box style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontWeight: '600' }}>{p.title || p.url}</Text>
                <Text numberOfLines={1} color="muted" style={{ fontSize: 12 }}>{p.url}</Text>
                <Text numberOfLines={1} color="muted" style={{ fontSize: 11 }}>
                  {p.mode === 'online' ? 'Online bookmark (scroll restore only)' : 'Offline snapshot'}
                </Text>
              </Box>
              <Pressable onPress={() => openSavedPage(p)} style={({ pressed }) => [styles.smallBtn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}>
                <Text color="buttonText">Open</Text>
              </Pressable>
              <Pressable onPress={async () => { await removeSavedPage(p.id); refresh(); }} style={({ pressed }) => [styles.smallBtn, { backgroundColor: '#d33', opacity: pressed ? 0.85 : 1 }]}>
                <Text color="buttonText">Delete</Text>
              </Pressable>
            </Box>
          ))
        )}
      </Box>

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
  container: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  button: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  smallBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallBtnText: { color: '#fff' },
  clearRecentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
});
