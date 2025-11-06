import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SavedPage } from '@/lib/cache';
import { listSavedPages, removeSavedPage } from '@/lib/cache';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [input, setInput] = useState('https://example.com');
  const [pages, setPages] = useState<SavedPage[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const bgInput = colorScheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  async function refresh() {
    setRefreshing(true);
    setPages(await listSavedPages());
    setRefreshing(false);
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

  return (
    <ThemedView style={styles.container}>
      <View style={styles.controlsRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Enter URL to open"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={openUrl}
          style={[styles.input, { color: theme.text, borderColor: 'rgba(0,0,0,0.15)', backgroundColor: bgInput }]}
        />
        <Pressable onPress={openUrl} style={({ pressed }) => [styles.button, { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 }]}>
          <ThemedText style={styles.buttonText}>Open</ThemedText>
        </Pressable>
      </View>

      <ThemedText type="subtitle" style={{ marginTop: 12, marginBottom: 4 }}>Saved Pages</ThemedText>
      <View style={{ flex: 1 }}>
        {pages.length === 0 ? (
          <ThemedText style={{ opacity: 0.7 }}>No saved pages yet.</ThemedText>
        ) : (
          pages.map((p) => (
            <View key={p.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <ThemedText numberOfLines={1} style={{ fontWeight: '600' }}>{p.title || p.url}</ThemedText>
                <ThemedText numberOfLines={1} style={{ opacity: 0.7, fontSize: 12 }}>{p.url}</ThemedText>
              </View>
              <Pressable onPress={() => router.push({ pathname: '/browser', params: { id: p.id } })} style={({ pressed }) => [styles.smallBtn, { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 }]}>
                <ThemedText style={styles.smallBtnText}>Open</ThemedText>
              </Pressable>
              <Pressable onPress={async () => { await removeSavedPage(p.id); refresh(); }} style={({ pressed }) => [styles.smallBtn, { backgroundColor: '#d33', opacity: pressed ? 0.85 : 1 }]}>
                <ThemedText style={styles.smallBtnText}>Delete</ThemedText>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ThemedView>
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
});
