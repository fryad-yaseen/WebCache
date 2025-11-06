import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SavedPage } from '@/lib/cache';
import { addSavedPage, listSavedPages, readSavedHtml, updateScrollY } from '@/lib/cache';

type WebViewType = any;

export default function BrowserScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; id?: string }>();

  const [input, setInput] = useState<string>(typeof params.url === 'string' ? params.url : 'https://example.com');
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  type Source = { type: 'remote'; url: string } | { type: 'saved'; page: SavedPage };
  const [source, setSource] = useState<Source>(() => ({ type: 'remote', url: typeof params.url === 'string' ? params.url : 'https://example.com' }));
  const webRef = useRef<WebViewType>(null);
  const [WebViewImpl, setWebViewImpl] = useState<WebViewType | null>(null);
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const lastScrollRef = useRef(0);
  const scrollPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved page by ID if provided
  useEffect(() => {
    (async () => {
      if (typeof params.id === 'string' && params.id) {
        const content = await readSavedHtml(params.id);
        const pages = await listSavedPages();
        const page = pages.find((p) => p.id === params.id);
        if (content && page) {
          (global as any).__RNWC_LAST_HTML = content.html;
          (global as any).__RNWC_LAST_BASEURL = content.baseUrl || undefined;
          setSource({ type: 'saved', page });
        }
      }
    })();
  }, [params.id]);

  useEffect(() => {
    let active = true;
    import('react-native-webview')
      .then((mod: any) => {
        if (active) setWebViewImpl(() => mod.WebView);
      })
      .catch((err) => {
        if (active) setWebviewError(String(err?.message ?? err));
      });
    return () => {
      active = false;
    };
  }, []);

  const normalized = useMemo(() => normalizeUrl(input), [input]);

  function onGo() {
    if (!normalized) return;
    setSource({ type: 'remote', url: normalized });
    setOverlayVisible(false);
  }

  const toggleOverlay = useCallback(() => setOverlayVisible((v) => !v), []);
  const twoFingerTap = useMemo(() =>
    Gesture.Tap()
      .numberOfTaps(1)
      .minPointers(2)
      .onEnd(() => {
        runOnJS(toggleOverlay)();
      })
  , [toggleOverlay]);

  const injectedBase = useMemo(() => getInjectedBaseScript(source.type === 'saved' ? source.page.scrollY : 0), [source]);

  const handleMessage = useCallback(async (event: any) => {
    try {
      const data = JSON.parse(event?.nativeEvent?.data ?? '{}');
      if (data?.type === 'SCROLL') {
        const y = Number(data?.payload?.y || 0);
        lastScrollRef.current = y;
        if (source.type === 'saved') {
          if (!scrollPersistTimer.current) {
            scrollPersistTimer.current = setTimeout(async () => {
              scrollPersistTimer.current = null;
              try {
                await updateScrollY(source.page.id, lastScrollRef.current);
              } catch {}
            }, 1000);
          }
        }
      } else if (data?.type === 'PAGE_SNAPSHOT') {
        const { html, title, url, scrollY } = data.payload || {};
        if (!html || !url) return;
        await addSavedPage({ html, title: title || url, url, scrollY: Number(scrollY || 0) });
        setSaving(false);
      } else if (data?.type === 'ERROR') {
        setSaving(false);
      }
    } catch {
      // ignore parse errors
    }
  }, [source]);

  const requestSave = useCallback(() => {
    if (!WebViewImpl || !webRef.current) return;
    setSaving(true);
    const cmd = `(() => { try { if (window.__rn_savePage) { window.__rn_savePage(); } } catch (e) {} })(); true;`;
    // @ts-ignore
    webRef.current.injectJavaScript(cmd);
  }, [WebViewImpl]);

  const overlayDim = colorScheme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)';

  return (
    <GestureDetector gesture={twoFingerTap}>
      <ThemedView style={styles.container}>
        {WebViewImpl ? (
          <WebViewImpl
            ref={webRef}
            source={
              source.type === 'remote'
                ? { uri: source.url }
                : { html: (global as any).__RNWC_LAST_HTML || '<html></html>', baseUrl: (global as any).__RNWC_LAST_BASEURL || undefined }
            }
            originWhitelist={["*"]}
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            style={styles.webview}
            injectedJavaScriptBeforeContentLoaded={injectedBase}
            onMessage={handleMessage}
          />
        ) : (
          <ThemedView style={styles.placeholder}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              WebView not available yet.
            </ThemedText>
            <ThemedText style={{ textAlign: 'center', marginTop: 8 }}>
              If you’re using Expo Go, build a Dev Client or rebuild after installing react-native-webview.
            </ThemedText>
            {webviewError ? (
              <ThemedText style={{ marginTop: 8, opacity: 0.6 }}>Error: {webviewError}</ThemedText>
            ) : null}
            {Platform.OS === 'web' ? (
              // @ts-ignore
              <iframe src={source.type === 'remote' ? source.url : ''} style={{ border: 0, width: '100%', height: '100%', marginTop: 12 }} />
            ) : null}
          </ThemedView>
        )}

        {overlayVisible && (
          <View pointerEvents="box-none" style={[styles.overlay, { backgroundColor: overlayDim }]}> 
            <View style={[styles.panel, { backgroundColor: theme.background }]}> 
              <ThemedText type="subtitle">Controls</ThemedText>
              <View style={styles.controlsRow}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Enter URL (e.g. example.com)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={Platform.select({ ios: 'url', android: 'url', default: 'default' })}
                  returnKeyType="go"
                  onSubmitEditing={onGo}
                  style={[styles.input, { color: theme.text, borderColor: withAlpha(theme.text, 0.15), backgroundColor: colorScheme==='dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                />
                <Pressable onPress={onGo} style={({ pressed }) => [styles.button, { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 }]}>
                  <ThemedText style={styles.buttonText}>Go</ThemedText>
                </Pressable>
              </View>
              <View style={styles.controlsRow}>
                <Pressable onPress={requestSave} disabled={!WebViewImpl || saving} style={({ pressed }) => [styles.button, { backgroundColor: saving ? '#999' : theme.tint, opacity: pressed ? 0.85 : 1 }]}>
                  <ThemedText style={styles.buttonText}>{saving ? 'Saving…' : 'Save'}</ThemedText>
                </Pressable>
                <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.button, { backgroundColor: '#444', opacity: pressed ? 0.85 : 1 }]}>
                  <ThemedText style={styles.buttonText}>Exit</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </ThemedView>
    </GestureDetector>
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

function withAlpha(_color: string, alpha: number): string {
  return `rgba(0,0,0,${alpha})`;
}

function getInjectedBaseScript(initialScrollY: number) {
  const code = `
    (function(){
      try {
        var RNWV = {
          send: function(type, payload){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type: type, payload: payload||{}})); } catch (e) {} }
        };
        var throttle = function(fn, ms){ var t=0; return function(){ var now=Date.now(); if(now-t>ms){ t=now; try{ fn.apply(this, arguments);}catch(e){} } } };
        window.addEventListener('scroll', throttle(function(){ RNWV.send('SCROLL', { y: window.scrollY, x: window.scrollX, url: location.href }); }, 250), { passive: true });

        if (${Number.isFinite(initialScrollY) ? initialScrollY : 0} > 0) {
          var y = ${Math.floor(initialScrollY || 0)};
          var scrollIt = function(){ try { window.scrollTo(0, y); } catch(e){} };
          if (document.readyState === 'complete' || document.readyState === 'interactive') { setTimeout(scrollIt, 50); } else { document.addEventListener('DOMContentLoaded', function(){ setTimeout(scrollIt, 50); }); }
        }

        async function inlineImages(doc){
          var imgs = Array.prototype.slice.call(doc.querySelectorAll('img[src]'));
          for (var i=0;i<imgs.length;i++){
            var img = imgs[i];
            try {
              var res = await fetch(img.src, { credentials: 'include' });
              var blob = await res.blob();
              var reader = new FileReader();
              var p = new Promise(function(resolve){ reader.onloadend = resolve; });
              reader.readAsDataURL(blob);
              await p;
              img.setAttribute('src', reader.result);
              img.removeAttribute('srcset');
            } catch (e) {}
          }
        }

        async function inlineStylesheets(doc){
          var links = Array.prototype.slice.call(doc.querySelectorAll('link[rel="stylesheet"][href]'));
          for (var i=0;i<links.length;i++){
            var link = links[i];
            try {
              var res = await fetch(link.href, { credentials: 'include' });
              var css = await res.text();
              var style = doc.createElement('style');
              style.textContent = css;
              link.parentNode && link.parentNode.replaceChild(style, link);
            } catch (e) {}
          }
        }

        window.__rn_savePage = async function(){
          try {
            await inlineStylesheets(document);
            await inlineImages(document);
            var html = '<!DOCTYPE html>'+document.documentElement.outerHTML;
            RNWV.send('PAGE_SNAPSHOT', { html: html, title: document.title, url: location.href, scrollY: window.scrollY });
          } catch (e) {
            RNWV.send('ERROR', { message: (e && e.message) ? e.message : String(e) });
          }
        };
      } catch (e) {}
    })();
    true;
  `;
  return code;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  webview: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    padding: 12,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    justifyContent: 'flex-end',
  },
  panel: {
    padding: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    gap: 8,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
});
