import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Paths } from 'expo-file-system';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Box, Text } from '@/theme/restyle';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SavedPage } from '@/lib/cache';
import { addSavedPage, getSavedPage, updateScrollY } from '@/lib/cache';
import { cachePageHtml, getCachedPageHtml, preloadPageHtml } from '@/lib/page-html-cache';

type WebViewType = any;

export default function BrowserScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; id?: string; page?: string }>();
  const prefetchedPage = useMemo(() => parseSavedPageParam(params.page), [params.page]);
  const initialUrl = typeof params.url === 'string' ? params.url : 'about:blank';

  const [input, setInput] = useState<string>(typeof params.url === 'string' ? params.url : '');
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<'device' | 'light' | 'dark'>('device');
  const [webCanGoBack, setWebCanGoBack] = useState(false);
  const [webCanGoForward, setWebCanGoForward] = useState(false);

  type Source = { type: 'remote'; url: string } | { type: 'saved'; page: SavedPage };
  const [source, setSource] = useState<Source>(() => {
    if (prefetchedPage && typeof params.id === 'string' && prefetchedPage.id === params.id) {
      return { type: 'saved', page: prefetchedPage };
    }
    return { type: 'remote', url: initialUrl };
  });
  const webRef = useRef<WebViewType>(null);
  const [WebViewImpl, setWebViewImpl] = useState<WebViewType | null>(null);
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const [webBanner, setWebBanner] = useState<{ type: 'info' | 'error'; message: string } | null>(null);
  const [, setWebLoading] = useState<boolean>(false);
  const lastScrollRef = useRef(0);
  const scrollPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialSavedHtml = prefetchedPage ? getCachedPageHtml(prefetchedPage.id) : null;
  const [savedHtml, setSavedHtml] = useState<string | null>(initialSavedHtml);
  const [savedHtmlStatus, setSavedHtmlStatus] = useState<'idle' | 'loading' | 'error'>(initialSavedHtml ? 'idle' : 'idle');

  // Load saved page by ID if provided
  useEffect(() => {
    let cancelled = false;
    const id = typeof params.id === 'string' ? params.id : null;
    if (!id) return () => {};

    if (prefetchedPage && prefetchedPage.id === id) {
      setSource({ type: 'saved', page: prefetchedPage });
      return () => {};
    }

    (async () => {
      try {
        const page = await getSavedPage(id);
        if (!cancelled) {
          if (page) {
            setSource({ type: 'saved', page });
          } else {
            setWebBanner({ type: 'error', message: 'Saved page not found.' });
          }
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id, prefetchedPage]);

  useEffect(() => {
    try {
      // Avoid dynamic import so metro does not emit a split chunk in production.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('react-native-webview');
      const Impl = mod?.WebView ?? mod?.default ?? null;
      if (Impl) {
        setWebViewImpl(() => Impl);
      } else {
        setWebviewError('react-native-webview did not export a WebView implementation.');
      }
    } catch (err: any) {
      setWebviewError(String(err?.message ?? err));
    }
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
      .maxDeltaX(12)
      .maxDeltaY(12)
      .maxDuration(220)
      .cancelsTouchesInView(false)
      .onEnd(() => { runOnJS(toggleOverlay)(); })
  , [toggleOverlay]);

  const goWebBack = useCallback(() => {
    if (!webCanGoBack || !webRef.current) return;
    try {
      // @ts-ignore
      webRef.current.goBack();
    } catch {}
  }, [webCanGoBack]);

  const goWebForward = useCallback(() => {
    if (!webCanGoForward || !webRef.current) return;
    try {
      // @ts-ignore
      webRef.current.goForward();
    } catch {}
  }, [webCanGoForward]);

  function SegmentedOption({ label, selected, onPress, accent }: { label: string; selected: boolean; onPress: () => void; accent: string }) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [
        {
          height: 32,
          paddingHorizontal: 12,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: selected ? accent : 'rgba(125,125,125,0.4)',
          backgroundColor: selected ? accent : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
        <Text style={selected ? { color: '#fff' } : undefined}>{label}</Text>
      </Pressable>
    );
  }

  const savedScrollTarget = source.type === 'saved' ? source.page.scrollY : 0;
  const savedPageUrl = source.type === 'saved' ? source.page.url : null;
  const savedBaseHref = source.type === 'saved' ? getBaseHref(source.page.url) : null;
  const shouldUseFileUri = source.type === 'saved' && !savedHtml && savedHtmlStatus === 'error';
  const webviewSource = source.type === 'saved'
    ? (savedHtml
        ? { html: savedHtml, baseUrl: savedPageUrl ?? savedBaseHref ?? undefined }
        : (savedHtmlStatus === 'error' ? { uri: source.page.filePath } : null))
    : { uri: source.url };
  const injectedBase = useMemo(() => getInjectedBaseScript(savedScrollTarget, savedBaseHref), [savedScrollTarget, savedBaseHref]);
  const documentDirectoryUri = Platform.OS === 'web' ? undefined : Paths.document.uri;
  const handleShouldStartLoadWithRequest = useCallback((request: any) => {
    if (source.type !== 'saved') {
      debugLog('Allowing remote navigation', request?.url);
      return true;
    }
    const url: string = typeof request?.url === 'string' ? request.url : '';
    if (!url) {
      debugLog('Blocked navigation: missing URL in request while viewing snapshot');
      return false;
    }
    const normalized = url.split('#')[0];
    if (
      normalized === 'about:blank' ||
      normalized.startsWith('file://') ||
      normalized.startsWith('data:')
    ) {
      debugLog('Allowing internal snapshot navigation', normalized);
      return true;
    }
    debugLog('Blocked external navigation from snapshot', { url: normalized, savedHtmlStatus });
    if (!webBanner || webBanner.type !== 'info') {
      setWebBanner({ type: 'info', message: 'Viewing an offline snapshot. Use Go to browse live pages.' });
    }
    return false;
  }, [source, webBanner, savedHtmlStatus]);

  useEffect(() => {
    debugLog('Source changed', source.type === 'saved' ? { type: 'saved', id: source.page.id, url: source.page.url } : { type: 'remote', url: source.url });
    setWebCanGoBack(false);
    setWebCanGoForward(false);
    setWebBanner(null);
  }, [source]);

  useEffect(() => {
    if (source.type !== 'saved') {
      debugLog('Exiting saved mode, clearing snapshot state');
      setSavedHtml(null);
      setSavedHtmlStatus('idle');
      return;
    }
    const existing = getCachedPageHtml(source.page.id);
    if (existing) {
      debugLog('Using cached HTML for saved page', source.page.id);
      setSavedHtml(existing);
      setSavedHtmlStatus('idle');
      return;
    }
    let cancelled = false;
    debugLog('Preloading saved HTML for', source.page.id);
    setSavedHtml(null);
    setSavedHtmlStatus('loading');
    preloadPageHtml(source.page).then((html) => {
      if (cancelled) return;
      if (html) {
        debugLog('Loaded saved HTML', { id: source.page.id, bytes: html.length });
        setSavedHtml(html);
        setSavedHtmlStatus('idle');
      } else {
        debugLog('Failed to load saved HTML', source.page.id);
        setSavedHtmlStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Live preview of theme choice before saving (remote pages only)
  useEffect(() => {
    if (source.type !== 'remote') return;
    if (!webRef.current) return;
    const apply = `(() => { try {
      var prev = document.getElementById('__rn_save_theme');
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
      var mode = ${JSON.stringify(saveMode)};
      var deviceDark = ${JSON.stringify(colorScheme === 'dark')};
      var shouldInvert = (mode === 'dark' && deviceDark === false) || (mode === 'light' && deviceDark === true);
      if (shouldInvert) {
        var style = document.createElement('style');
        style.id = '__rn_save_theme';
        style.textContent = 'html { filter: invert(1) hue-rotate(180deg); background: #111 !important; } img, picture, video, canvas, svg { filter: invert(1) hue-rotate(180deg) !important; }';
        document.documentElement.appendChild(style);
      }
    } catch (e) {} })(); true;`;
    // @ts-ignore
    webRef.current.injectJavaScript(apply);
  }, [saveMode, colorScheme, source]);

  const handleMessage = useCallback(async (event: any) => {
    try {
      const data = JSON.parse(event?.nativeEvent?.data ?? '{}');
      if (data?.type && data.type !== 'SCROLL') {
        debugLog('WebView message', data.type, data.payload ? Object.keys(data.payload) : 'no payload');
      }
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
        debugLog('Saving snapshot', url, 'size', html.length);
        const saved = await addSavedPage({ html, title: title || url, url, scrollY: Number(scrollY || 0) });
        cachePageHtml(saved.id, html);
        setSaving(false);
      } else if (data?.type === 'ERROR') {
        debugLog('Snapshot error payload', data?.payload);
        setSaving(false);
      }
    } catch {
      // ignore parse errors
    }
  }, [source]);

  const requestSave = useCallback(() => {
    if (!WebViewImpl || !webRef.current) return;
    setSaving(true);
    debugLog('Requesting snapshot capture', { mode: saveMode, colorScheme });
    const opts = JSON.stringify({ mode: saveMode, deviceDark: colorScheme === 'dark' });
    const cmd = `(() => { try { if (window.__rn_savePage) { window.__rn_savePage(${opts}); } } catch (e) {} })(); true;`;
    // @ts-ignore
    webRef.current.injectJavaScript(cmd);
  }, [WebViewImpl, saveMode, colorScheme]);

  const overlayDim = withAlpha(realColor(theme.text), colorScheme === 'dark' ? 0.5 : 0.35);
  const accent = colorScheme === 'dark' ? '#3b82f6' : theme.tint;
  const subtleBg = colorScheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const borderColor = withAlpha(realColor(theme.text), 0.15);

  return (
    <GestureDetector gesture={twoFingerTap}>
      <Box style={styles.container} backgroundColor="background">
          {/* Offline / error banner for remote pages */}
          {source.type === 'remote' && webBanner && (
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              padding={3}
              style={[
                styles.banner,
                webBanner.type === 'error'
                  ? {
                      backgroundColor: colorScheme === 'dark' ? '#7f1d1d' : '#dc2626',
                      borderColor: colorScheme === 'dark' ? '#ef4444' : '#b91c1c',
                    }
                  : {
                      backgroundColor: colorScheme === 'dark' ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.12)',
                      borderColor: withAlpha(accent, 0.45),
                    },
              ]}
            >
              <Text style={[styles.bannerText, webBanner.type === 'error' ? { color: '#fff' } : { color: colorScheme === 'dark' ? '#bfdbfe' : '#1e3a8a' }]}>
                {webBanner.message}
              </Text>
              <View style={{ height: 8 }} />
              <Pressable onPress={() => { try { // @ts-ignore
                webRef.current?.reload?.(); setWebBanner(null); } catch {} }} style={({ pressed }) => [
                  styles.button,
                  {
                    backgroundColor: webBanner.type === 'error' ? '#00000033' : withAlpha(accent, pressed ? 0.55 : 0.35),
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <Text style={[styles.bannerButtonText, webBanner.type === 'error'
                  ? { color: '#fff' }
                  : { color: colorScheme === 'dark' ? '#dbeafe' : '#1e3a8a' }
                ]}>
                  {webBanner.type === 'error' ? 'Retry' : 'Try Again'}
                </Text>
              </Pressable>
            </Box>
          )}
          {WebViewImpl && webviewSource ? (
            <WebViewImpl
              ref={webRef}
              source={webviewSource}
              originWhitelist={["*"]}
              setSupportMultipleWindows={false}
              allowingReadAccessToURL={shouldUseFileUri ? documentDirectoryUri : undefined}
              allowFileAccess={shouldUseFileUri}
              allowFileAccessFromFileURLs={shouldUseFileUri}
              style={styles.webview}
              injectedJavaScriptBeforeContentLoaded={injectedBase}
              onMessage={handleMessage}
              onLoadStart={() => {
                setWebBanner(null);
                setWebLoading(true);
              }}
              onLoadEnd={() => setWebLoading(false)}
              onError={(syntheticEvent: any) => {
                setWebLoading(false);
                const nativeEvent = syntheticEvent?.nativeEvent;
                const description = String(nativeEvent?.description ?? '');
                const rawCode = typeof nativeEvent?.code === 'number' ? nativeEvent.code : Number(nativeEvent?.code);
                const code = Number.isFinite(rawCode) ? rawCode : NaN;
                if (isOfflineLikeError(description, code)) {
                  setWebBanner({ type: 'info', message: 'No internet connection. Connect to the internet and try again.' });
                } else {
                  setWebBanner({ type: 'error', message: 'Something went wrong loading this page.' });
                }
              }}
              onHttpError={(e: any) => {
                setWebLoading(false);
                const status = e?.nativeEvent?.statusCode || '';
                setWebBanner({ type: 'error', message: `HTTP error ${status}. The site may be down.` });
              }}
              onNavigationStateChange={(navState: any) => {
                setWebCanGoBack(!!navState?.canGoBack);
                setWebCanGoForward(!!navState?.canGoForward);
              }}
              onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            />
          ) : (
            <Box style={styles.placeholder}>
              {!WebViewImpl ? (
                <>
                  <Text variant="subtitle" style={{ textAlign: 'center' }}>
                    WebView not available yet.
                  </Text>
                  <Text style={{ textAlign: 'center', marginTop: 8 }}>
                    If you’re using Expo Go, build a Dev Client or rebuild after installing react-native-webview.
                  </Text>
                  {webviewError ? (
                    <Text style={{ marginTop: 8, opacity: 0.6 }}>Error: {webviewError}</Text>
                  ) : null}
                  {Platform.OS === 'web' ? (
                    // @ts-ignore
                    <iframe src={source.type === 'remote' ? source.url : ''} style={{ border: 0, width: '100%', height: '100%', marginTop: 12 }} />
                  ) : null}
                </>
              ) : (
                <>
                  <Text variant="subtitle" style={{ textAlign: 'center' }}>Loading saved page…</Text>
                  <Text style={{ textAlign: 'center', marginTop: 8 }}>
                    Please wait while we prepare the offline copy.
                  </Text>
                </>
              )}
            </Box>
          )}

        {overlayVisible && (
          <Box pointerEvents="box-none" style={[styles.overlay, { backgroundColor: overlayDim }]}> 
            <Box style={[styles.panel]} backgroundColor="background">
              <Text variant="subtitle">Controls</Text>
              {source.type === 'remote' ? (
                <>
                  <Box flexDirection="row" alignItems="center" style={styles.controlsRow}>
                    <TextInput
                      value={input}
                      onChangeText={setInput}
                      placeholder="Enter URL (e.g. example.com)"
                      placeholderTextColor={colorScheme==='dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)'}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType={Platform.select({ ios: 'url', android: 'url', default: 'default' })}
                      returnKeyType="go"
                      onSubmitEditing={onGo}
                      style={[styles.input, { color: theme.text, borderColor, backgroundColor: subtleBg }]}
                    />
                    <Pressable onPress={onGo} style={({ pressed }) => [styles.button, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}>
                      <Text color="buttonText">Go</Text>
                    </Pressable>
                  </Box>
                  <Box flexDirection="row" alignItems="center" style={styles.controlsRow}>
                    <SegmentedOption label="Device" selected={saveMode==='device'} onPress={() => setSaveMode('device')} accent={accent} />
                    <SegmentedOption label="Light" selected={saveMode==='light'} onPress={() => setSaveMode('light')} accent={accent} />
                    <SegmentedOption label="Dark" selected={saveMode==='dark'} onPress={() => setSaveMode('dark')} accent={accent} />
                  </Box>
                  <Box flexDirection="row" alignItems="center" style={styles.controlsRow}>
                    <Pressable
                      onPress={goWebBack}
                      disabled={!webCanGoBack}
                      style={({ pressed }) => [
                        styles.button,
                        {
                          backgroundColor: webCanGoBack ? accent : '#6b7280',
                          opacity: pressed && webCanGoBack ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text color="buttonText">Back</Text>
                    </Pressable>
                    <Pressable
                      onPress={goWebForward}
                      disabled={!webCanGoForward}
                      style={({ pressed }) => [
                        styles.button,
                        {
                          backgroundColor: webCanGoForward ? accent : '#6b7280',
                          opacity: pressed && webCanGoForward ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text color="buttonText">Forward</Text>
                    </Pressable>
                  </Box>
                  <Box flexDirection="row" alignItems="center" style={styles.controlsRow}>
                    <Pressable onPress={requestSave} disabled={!WebViewImpl || saving} style={({ pressed }) => [styles.button, { backgroundColor: saving ? '#6b7280' : accent, opacity: pressed ? 0.85 : 1 }]}>
                      <Text color="buttonText">{saving ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                    <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.button, { backgroundColor: colorScheme==='dark' ? '#2d2d2d' : '#444', opacity: pressed ? 0.85 : 1 }]}>
                      <Text color="buttonText">Exit</Text>
                    </Pressable>
                  </Box>
                </>
              ) : (
                <Box flexDirection="row" alignItems="center" style={styles.controlsRow}>
                  <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.button, { backgroundColor: colorScheme==='dark' ? '#2d2d2d' : '#444', opacity: pressed ? 0.85 : 1 }]}>
                    <Text color="buttonText">Exit</Text>
                  </Pressable>
                </Box>
              )}
            </Box>
          </Box>
        )}
        </Box>
      </GestureDetector>
  );
}

function isOfflineLikeError(description: string, code: number): boolean {
  const offlineCodes = new Set([-1009, -1020, -1005, -1001, -6, -2]);
  if (Number.isFinite(code) && offlineCodes.has(code)) return true;
  const lowered = description.toLowerCase();
  return lowered.includes('internet') || lowered.includes('network') || lowered.includes('offline') || lowered.includes('disconnected');
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

function debugLog(...args: any[]): void {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return;
  }
  try {
    // eslint-disable-next-line no-console
    console.log('[Browser]', ...args);
  } catch {}
}

function realColor(color: string): string { return color || '#000000'; }
function parseSavedPageParam(raw: unknown): SavedPage | null {
  if (typeof raw !== 'string' || !raw) return null;
  const attempts = [raw];
  try {
    attempts.push(decodeURIComponent(raw));
  } catch {}
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      const coerced = coerceSavedPage(parsed);
      if (coerced) return coerced;
    } catch {}
  }
  return null;
}

function coerceSavedPage(value: any): SavedPage | null {
  if (!value || typeof value !== 'object') return null;
  const { id, url, title, savedAt, scrollY, filePath } = value as Partial<SavedPage>;
  if (typeof id !== 'string' || typeof url !== 'string' || typeof filePath !== 'string') {
    return null;
  }
  return {
    id,
    url,
    title: typeof title === 'string' ? title : url,
    savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : Date.now(),
    scrollY: typeof scrollY === 'number' && Number.isFinite(scrollY) ? scrollY : Number(scrollY) || 0,
    filePath,
  };
}

function getBaseHref(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    let path = u.pathname || '/';
    if (!path.endsWith('/')) {
      const lastSlash = path.lastIndexOf('/');
      const lastSegment = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
      const looksLikeFile = lastSegment.includes('.');
      if (looksLikeFile) {
        path = path.slice(0, lastSlash + 1);
      } else {
        path = `${path}/`;
      }
    }
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    return `${u.protocol}//${u.host}${path || '/'}`;
  } catch {
    return null;
  }
}

function withAlpha(color: string, alpha: number): string {
  const c = realColor(color).replace('#','');
  const r = parseInt(c.substring(0,2),16)||0;
  const g = parseInt(c.substring(2,4),16)||0;
  const b = parseInt(c.substring(4,6),16)||0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function getInjectedBaseScript(initialScrollY: number, savedBaseHref: string | null) {
  const code = `
    (function(){
      try {
        var RNWV = {
          send: function(type, payload){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type: type, payload: payload||{}})); } catch (e) {} }
        };
        var throttle = function(fn, ms){ var t=0; return function(){ var now=Date.now(); if(now-t>ms){ t=now; try{ fn.apply(this, arguments);}catch(e){} } } };
        window.addEventListener('scroll', throttle(function(){ RNWV.send('SCROLL', { y: window.scrollY, x: window.scrollX, url: location.href }); }, 250), { passive: true });

        var baseHref = ${savedBaseHref ? JSON.stringify(savedBaseHref) : 'null'};
        if (baseHref) {
          var ensureBase = function(){
            try {
              var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
              if (!head) return;
              var existing = head.querySelector('base[data-rnwc-base]');
              if (!existing) {
                existing = document.createElement('base');
                existing.setAttribute('data-rnwc-base', '1');
                if (head.firstChild) {
                  head.insertBefore(existing, head.firstChild);
                } else {
                  head.appendChild(existing);
                }
              }
              existing.setAttribute('href', baseHref);
            } catch (e) {}
          };
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ensureBase);
          }
          ensureBase();
        }

        var targetScroll = ${Number.isFinite(initialScrollY) ? Math.floor(initialScrollY) : 0};
        if (targetScroll > 0) {
          var applyScroll = function(attempts){
            try { window.scrollTo(0, targetScroll); } catch(e) {}
            var current = Math.abs(window.scrollY - targetScroll);
            if (current > 1 && attempts < 16) {
              requestAnimationFrame(function(){ applyScroll((attempts||0)+1); });
            }
          };
          var kick = function(){ requestAnimationFrame(function(){ applyScroll(0); }); };
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', kick, { once: true });
          } else {
            kick();
          }
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

        function stripScripts(root){
          try {
            var scripts = Array.prototype.slice.call(root.querySelectorAll('script'));
            for (var i=0;i<scripts.length;i++){
              var script = scripts[i];
              if (script && script.parentNode) {
                script.parentNode.removeChild(script);
              }
            }
          } catch (e) {}
        }

        window.__rn_savePage = async function(options){
          try {
            try {
              var prev = document.getElementById('__rn_save_theme');
              if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
            } catch(e) {}
            var mode = (options && options.mode) || options || 'device';
            var deviceDark = !!(options && options.deviceDark);
            var shouldInvert = (mode === 'dark' && deviceDark === false) || (mode === 'light' && deviceDark === true);
            if (shouldInvert) {
              var style = document.createElement('style');
              style.id = '__rn_save_theme';
              style.textContent = 'html { filter: invert(1) hue-rotate(180deg); background: #111 !important; } img, picture, video, canvas, svg { filter: invert(1) hue-rotate(180deg) !important; }';
              document.documentElement.appendChild(style);
            }
            await inlineStylesheets(document);
            await inlineImages(document);
            var clone = document.documentElement.cloneNode(true);
            stripScripts(clone);
            var html = '<!DOCTYPE html>'+clone.outerHTML;
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
  banner: {
    zIndex: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  bannerText: {
    fontWeight: '600',
  },
  bannerButtonText: {
    fontWeight: '600',
  },
});
