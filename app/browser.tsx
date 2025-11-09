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

type ResourceResponseMessage = {
  id: string;
  success: boolean;
  body?: string | null;
  dataUrl?: string | null;
  mime?: string | null;
  error?: string | null;
};

type ResourceRequestPayload = {
  id: string;
  url: string;
  responseType?: 'text' | 'data-url';
  headers?: Record<string, string> | null;
};

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
  const [saveType, setSaveType] = useState<'offline' | 'online'>('offline');
  const [webCanGoBack, setWebCanGoBack] = useState(false);
  const [webCanGoForward, setWebCanGoForward] = useState(false);
  const [currentNavMeta, setCurrentNavMeta] = useState<{ url: string; title: string }>({ url: initialUrl, title: '' });

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
  const initialSavedHtml = prefetchedPage && prefetchedPage.mode !== 'online' ? getCachedPageHtml(prefetchedPage.id) : null;
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

  function SegmentedOption({ label, selected, onPress, accent, disabled = false }: { label: string; selected: boolean; onPress: () => void; accent: string; disabled?: boolean }) {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [
        {
          height: 32,
          paddingHorizontal: 12,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: selected ? accent : 'rgba(125,125,125,0.4)',
          backgroundColor: selected ? accent : 'transparent',
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}>
        <Text style={selected ? { color: '#fff' } : undefined}>{label}</Text>
      </Pressable>
    );
  }

  const isSavedPage = source.type === 'saved';
  const isSavedOnline = isSavedPage && source.page.mode === 'online';
  const isSavedOffline = isSavedPage && !isSavedOnline;
  const savedScrollTarget = isSavedPage ? source.page.scrollY : 0;
  const savedPageUrl = isSavedPage ? source.page.url : null;
  const savedBaseHref = isSavedOffline ? getBaseHref(source.page.url) : null;
  const shouldUseFileUri = isSavedOffline && !savedHtml && savedHtmlStatus === 'error' && !!source.page.filePath;
  const webviewSource = source.type === 'saved'
    ? (isSavedOnline
        ? { uri: source.page.url }
        : (savedHtml
            ? { html: savedHtml, baseUrl: savedPageUrl ?? savedBaseHref ?? undefined }
            : (savedHtmlStatus === 'error' && source.page.filePath ? { uri: source.page.filePath } : null)))
    : { uri: source.url };
  const injectedBase = useMemo(() => getInjectedBaseScript(savedScrollTarget, savedBaseHref), [savedScrollTarget, savedBaseHref]);
  const documentDirectoryUri = Platform.OS === 'web' ? undefined : Paths.document.uri;
  const handleShouldStartLoadWithRequest = useCallback((request: any) => {
    if (source.type !== 'saved' || source.page.mode === 'online') {
      return true;
    }
    const url: string = typeof request?.url === 'string' ? request.url : '';
    if (!url) {
      return false;
    }
    const normalized = url.split('#')[0];
    if (
      normalized === 'about:blank' ||
      normalized.startsWith('file://') ||
      normalized.startsWith('data:')
    ) {
      return true;
    }
    if (!webBanner || webBanner.type !== 'info') {
      setWebBanner({ type: 'info', message: 'Viewing an offline snapshot. Use Go to browse live pages.' });
    }
    return false;
  }, [source, webBanner]);

  useEffect(() => {
    setWebCanGoBack(false);
    setWebCanGoForward(false);
    if (isSavedOnline) {
      setWebBanner({ type: 'info', message: 'Online bookmark. Connect to the internet to view; scroll position will be restored.' });
    } else {
      setWebBanner(null);
    }
  }, [source, isSavedOnline]);

  useEffect(() => {
    if (source.type === 'saved') {
      setCurrentNavMeta((prev) => ({
        url: source.page.url || prev.url,
        title: source.page.title || prev.title,
      }));
    }
  }, [source]);

  useEffect(() => {
    if (!isSavedOffline) {
      setSavedHtml(null);
      setSavedHtmlStatus('idle');
      return;
    }
    const existing = getCachedPageHtml(source.page.id);
    if (existing) {
      setSavedHtml(existing);
      setSavedHtmlStatus('idle');
      return;
    }
    let cancelled = false;
    setSavedHtml(null);
    setSavedHtmlStatus('loading');
    preloadPageHtml(source.page).then((html) => {
      if (cancelled) return;
      if (html) {
        setSavedHtml(html);
        setSavedHtmlStatus('idle');
      } else {
        setSavedHtmlStatus('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [source, isSavedOffline]);

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

  const handleResourceRequest = useCallback((payload: ResourceRequestPayload) => {
    if (!payload || typeof payload.id !== 'string' || typeof payload.url !== 'string') {
      return;
    }
    const { id, url } = payload;
    const responseType = payload.responseType === 'data-url' ? 'data-url' : 'text';
    const headers = payload.headers ?? undefined;
    const respond = (message: ResourceResponseMessage) => {
      if (!webRef.current) return;
      const js = `
        try {
          if (window.__rn_receiveResourceResponse) {
            window.__rn_receiveResourceResponse(${JSON.stringify(message)});
          }
        } catch (e) {}
        true;
      `;
      try {
        // @ts-ignore
        webRef.current.injectJavaScript(js);
      } catch {}
    };
    (async () => {
      try {
        const res = await fetch(url, {
          headers,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const mime = typeof res.headers?.get === 'function' ? res.headers.get('content-type') : null;
        if (responseType === 'data-url') {
          const buffer = await res.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          const dataUrl = `data:${mime ?? 'application/octet-stream'};base64,${base64}`;
          respond({ id, success: true, dataUrl, mime });
        } else {
          const text = await res.text();
          respond({ id, success: true, body: text, mime });
        }
      } catch (err: any) {
        respond({ id, success: false, error: err?.message ?? String(err) });
      }
    })();
  }, []);

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
        const saved = await addSavedPage({ html, title: title || url, url, scrollY: Number(scrollY || 0), mode: 'offline' });
        cachePageHtml(saved.id, html);
        setSaving(false);
        setOverlayVisible(false);
      } else if (data?.type === 'ERROR') {
        setSaving(false);
      } else if (data?.type === 'RESOURCE_REQUEST') {
        handleResourceRequest(data.payload);
      }
    } catch {
      // ignore parse errors
    }
  }, [source, handleResourceRequest]);

  const requestOfflineSave = useCallback(() => {
    if (!WebViewImpl || !webRef.current) return;
    setSaving(true);
    const opts = JSON.stringify({ mode: saveMode, deviceDark: colorScheme === 'dark' });
    const cmd = `(() => { try { if (window.__rn_savePage) { window.__rn_savePage(${opts}); } } catch (e) {} })(); true;`;
    // @ts-ignore
    webRef.current.injectJavaScript(cmd);
  }, [WebViewImpl, saveMode, colorScheme]);

  const saveOnlineBookmark = useCallback(async () => {
    const fallbackUrl = source.type === 'remote' ? source.url : source.type === 'saved' ? source.page.url : initialUrl;
    const targetUrl = currentNavMeta.url && currentNavMeta.url !== 'about:blank' ? currentNavMeta.url : fallbackUrl;
    if (!targetUrl) {
      setWebBanner({ type: 'error', message: 'Unable to determine the current URL to save.' });
      return;
    }
    setSaving(true);
    try {
      await addSavedPage({
        url: targetUrl,
        title: currentNavMeta.title || targetUrl,
        scrollY: lastScrollRef.current,
        mode: 'online',
      });
      setOverlayVisible(false);
      setWebBanner({ type: 'info', message: 'Saved online bookmark. Scroll position will restore next time.' });
    } catch {
      setWebBanner({ type: 'error', message: 'Unable to save online bookmark.' });
    } finally {
      setSaving(false);
    }
  }, [currentNavMeta, initialUrl, source]);

  const handleSavePress = useCallback(() => {
    if (saving) return;
    if (saveType === 'online') {
      saveOnlineBookmark();
    } else {
      requestOfflineSave();
    }
  }, [saveType, saveOnlineBookmark, requestOfflineSave, saving]);

  const overlayDim = withAlpha(realColor(theme.text), colorScheme === 'dark' ? 0.5 : 0.35);
  const accent = colorScheme === 'dark' ? '#3b82f6' : theme.tint;
  const subtleBg = colorScheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const borderColor = withAlpha(realColor(theme.text), 0.15);
  const saveButtonLabel = saving ? 'Saving…' : (saveType === 'online' ? 'Save Online' : 'Save Offline');
  const saveButtonDisabled = saving || (saveType === 'offline' && !WebViewImpl);

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
                setCurrentNavMeta((prev) => ({
                  url: typeof navState?.url === 'string' && navState.url ? navState.url : prev.url,
                  title: typeof navState?.title === 'string' ? navState.title : prev.title,
                }));
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
                    <SegmentedOption label="Offline" selected={saveType==='offline'} onPress={() => setSaveType('offline')} accent={accent} />
                    <SegmentedOption label="Online" selected={saveType==='online'} onPress={() => setSaveType('online')} accent={accent} />
                  </Box>
                  <Text style={{ fontSize: 12, opacity: 0.8 }}>
                    Offline saves cache the entire page for offline viewing. Online saves keep scroll position but require internet.
                  </Text>
                  <Box flexDirection="row" alignItems="center" style={styles.controlsRow}>
                    <SegmentedOption label="Device" selected={saveMode==='device'} onPress={() => setSaveMode('device')} accent={accent} disabled={saveType==='online'} />
                    <SegmentedOption label="Light" selected={saveMode==='light'} onPress={() => setSaveMode('light')} accent={accent} disabled={saveType==='online'} />
                    <SegmentedOption label="Dark" selected={saveMode==='dark'} onPress={() => setSaveMode('dark')} accent={accent} disabled={saveType==='online'} />
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
                    <Pressable onPress={handleSavePress} disabled={saveButtonDisabled} style={({ pressed }) => [styles.button, { backgroundColor: saveButtonDisabled ? '#6b7280' : accent, opacity: pressed ? 0.85 : 1 }]}>
                      <Text color="buttonText">{saveButtonLabel}</Text>
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
  const { id, url, title, savedAt, scrollY, filePath, mode } = value as Partial<SavedPage>;
  if (typeof id !== 'string' || typeof url !== 'string') {
    return null;
  }
  return {
    id,
    url,
    title: typeof title === 'string' ? title : url,
    savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : Date.now(),
    scrollY: typeof scrollY === 'number' && Number.isFinite(scrollY) ? scrollY : Number(scrollY) || 0,
    filePath: typeof filePath === 'string' ? filePath : null,
    mode: mode === 'online' ? 'online' : 'offline',
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

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    const enc1 = (triple >> 18) & 63;
    const enc2 = (triple >> 12) & 63;
    const enc3 = (triple >> 6) & 63;
    const enc4 = triple & 63;
    output += BASE64_CHARS.charAt(enc1);
    output += BASE64_CHARS.charAt(enc2);
    output += i + 1 < bytes.length ? BASE64_CHARS.charAt(enc3) : '=';
    output += i + 2 < bytes.length ? BASE64_CHARS.charAt(enc4) : '=';
  }
  return output;
}

function getInjectedBaseScript(initialScrollY: number, savedBaseHref: string | null) {
  const code = `
    (function(){
      try {
        var RNWV = {
          send: function(type, payload){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type: type, payload: payload||{}})); } catch (e) {} }
        };
        var __rn_resourceSeq = 0;
        var __rn_resourceResolvers = Object.create(null);
        RNWV.requestResource = function(request){
          return new Promise(function(resolve, reject){
            try {
              if (!request || !request.url || !window.ReactNativeWebView) {
                reject(new Error('native bridge unavailable'));
                return;
              }
              var id = 'res_'+Date.now()+'_'+(++__rn_resourceSeq);
              __rn_resourceResolvers[id] = { resolve: resolve, reject: reject };
              RNWV.send('RESOURCE_REQUEST', {
                id: id,
                url: request.url,
                responseType: request.responseType || 'text',
                headers: request && request.headers ? request.headers : null
              });
            } catch (err) {
              reject(err);
            }
          });
        };
        window.__rn_receiveResourceResponse = function(message){
          try {
            if (!message || !message.id) return;
            var resolver = __rn_resourceResolvers[message.id];
            if (!resolver) return;
            delete __rn_resourceResolvers[message.id];
            if (message.success) {
              resolver.resolve(message);
            } else {
              resolver.reject(message.error || 'Resource failed');
            }
          } catch (e) {}
        };
        var throttle = function(fn, ms){ var t=0; return function(){ var now=Date.now(); if(now-t>ms){ t=now; try{ fn.apply(this, arguments);}catch(e){} } } };
        window.addEventListener('scroll', throttle(function(){ RNWV.send('SCROLL', { y: window.scrollY, x: window.scrollX, url: location.href }); }, 250), { passive: true });

        function makeRefererHeaders(){
          try {
            var href = location.href;
            if (href && typeof href === 'string') {
              return { Referer: href };
            }
          } catch (e) {}
          return null;
        }

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
            var url = img.getAttribute('src') || img.src;
            var dataUrl = await fetchImageDataUrl(url);
            if (!dataUrl) continue;
            img.setAttribute('src', dataUrl);
            img.removeAttribute('srcset');
          }
        }

        async function fetchImageDataUrl(url){
          return fetchResourceDataUrl(url);
        }

        function blobToDataUrl(blob){
          return new Promise(function(resolve, reject){
            try {
              var reader = new FileReader();
              reader.onloadend = function(){ resolve(reader.result); };
              reader.onerror = function(){ reject(new Error('read error')); };
              reader.readAsDataURL(blob);
            } catch (e) {
              reject(e);
            }
          });
        }

        async function inlineStylesheets(doc){
          var links = Array.prototype.slice.call(doc.querySelectorAll('link[href]'));
          var cssCache = Object.create(null);
          var cssAssetCache = Object.create(null);
          for (var i=0;i<links.length;i++){
            var link = links[i];
            var relRaw = (link.getAttribute('rel') || '').toLowerCase();
            var tokens = relRaw.split(/\\s+/).filter(Boolean);
            var isStylesheet = tokens.indexOf('stylesheet') !== -1 || (tokens.indexOf('preload') !== -1 && ((link.getAttribute('as') || '').toLowerCase() === 'style'));
            if (!isStylesheet) continue;
            var css = await fetchStylesheetText(link.href, cssCache, link.href, cssAssetCache);
            if (!css) continue;
            var style = doc.createElement('style');
            style.textContent = css;
            style.setAttribute('data-rnwc-inline', '1');
            var media = link.getAttribute('media');
            if (media) {
              style.setAttribute('media', media);
            }
            link.parentNode && link.parentNode.replaceChild(style, link);
          }
        }

        async function fetchStylesheetText(url, cache, relativeTo, assetCache){
          var resolved = resolveResourceUrl(url, relativeTo);
          if (!resolved) return null;
          cache = cache || Object.create(null);
          if (cache[resolved]) {
            return cache[resolved];
          }
          var job = (async function(){
            var css = await fetchCssRaw(resolved);
            if (!css) return null;
            css = await inlineCssImports(css, resolved, cache, assetCache);
            css = await inlineCssAssetUrls(css, resolved, assetCache);
            return css;
          })();
          cache[resolved] = job;
          return await job;
        }

        async function inlineCssImports(cssText, baseUrl, cache, assetCache){
          if (!cssText || cssText.indexOf('@import') === -1) return cssText;
          var regex = /@import\\s+(?:url\\()?['"]?([^"')]+)['"]?(?:\\))?\\s*([^;]*);/gi;
          var result = '';
          var lastIndex = 0;
          var match;
          while ((match = regex.exec(cssText)) !== null) {
            result += cssText.slice(lastIndex, match.index);
            lastIndex = regex.lastIndex;
            var target = (match[1] || '').trim();
            if (!target) {
              result += cssText.slice(match.index, match.index + match[0].length);
              continue;
            }
            var media = (match[2] || '').trim();
            var absolute = resolveResourceUrl(target, baseUrl);
            if (!absolute) {
              result += cssText.slice(match.index, match.index + match[0].length);
              continue;
            }
            var imported = await fetchStylesheetText(absolute, cache, baseUrl, assetCache);
            if (!imported) {
              result += cssText.slice(match.index, match.index + match[0].length);
              continue;
            }
            if (media) {
              result += '@media ' + media + '{' + imported + '}';
            } else {
              result += imported;
            }
          }
          result += cssText.slice(lastIndex);
          return result;
        }

        function resolveResourceUrl(value, relativeTo){
          if (!value) return null;
          try {
            if (relativeTo) {
              return new URL(value, relativeTo).toString();
            }
            return new URL(value).toString();
          } catch (err) {
            try {
              return new URL(value, location.href).toString();
            } catch (e) {
              return null;
            }
          }
        }

        async function fetchCssRaw(url){
          try {
            var res = await fetch(url, { credentials: 'include' });
            if (!res.ok) throw new Error('bad status');
            return await res.text();
          } catch (err) {
            if (typeof RNWV.requestResource === 'function') {
              try {
                var nativeCss = await RNWV.requestResource({ url: url, responseType: 'text', headers: makeRefererHeaders() });
                if (nativeCss && typeof nativeCss.body === 'string') {
                  return nativeCss.body;
                }
              } catch (nativeErr) {}
            }
          }
          return null;
        }

        async function inlineCssAssetUrls(cssText, baseUrl, assetCache){
          if (!cssText || cssText.indexOf('url(') === -1) return cssText;
          assetCache = assetCache || Object.create(null);
          var regex = /url\\(\\s*(['"]?)([^'")]+)\\1\\s*\\)/gi;
          var result = '';
          var lastIndex = 0;
          var match;
          while ((match = regex.exec(cssText)) !== null) {
            result += cssText.slice(lastIndex, match.index);
            lastIndex = regex.lastIndex;
            var target = (match[2] || '').trim();
            if (!target) {
              result += match[0];
              continue;
            }
            var lowered = target.toLowerCase();
            if (lowered.startsWith('data:') || lowered.startsWith('blob:') || lowered.startsWith('javascript:') || lowered.startsWith('about:')) {
              result += match[0];
              continue;
            }
            if (target.startsWith('#')) {
              result += match[0];
              continue;
            }
            var absolute = resolveResourceUrl(target, baseUrl);
            if (!absolute) {
              result += match[0];
              continue;
            }
            var inlineData = await fetchCssAssetDataUrl(absolute, assetCache);
            if (inlineData) {
              result += 'url("' + inlineData + '")';
            } else {
              result += 'url("' + absolute + '")';
            }
          }
          result += cssText.slice(lastIndex);
          return result;
        }

        async function fetchCssAssetDataUrl(url, cache){
          cache = cache || Object.create(null);
          if (cache[url]) {
            return cache[url];
          }
          var job = fetchResourceDataUrl(url);
          cache[url] = job;
          return await job;
        }

        async function fetchResourceDataUrl(url){
          if (!url) return null;
          try {
            var res = await fetch(url, { credentials: 'include' });
            if (!res.ok) throw new Error('bad status');
            var blob = await res.blob();
            return await blobToDataUrl(blob);
          } catch (err) {
            if (typeof RNWV.requestResource === 'function') {
              try {
                var nativeRes = await RNWV.requestResource({ url: url, responseType: 'data-url', headers: makeRefererHeaders() });
                if (nativeRes && typeof nativeRes.dataUrl === 'string') {
                  return nativeRes.dataUrl;
                }
              } catch (nativeErr) {}
            }
          }
          return null;
        }

        function stripScripts(root){
          try {
            var scripts = Array.prototype.slice.call(root.querySelectorAll('script'));
            for (var i=0;i<scripts.length;i++){
              var script = scripts[i];
              if (!script || !script.parentNode) continue;
              var type = (script.getAttribute('type') || '').trim().toLowerCase();
              var hasSrc = script.hasAttribute('src');
              var isJsonLike = type && (type.indexOf('json') !== -1 || type.indexOf('ld+json') !== -1);
              if (isJsonLike) continue;
              var shouldRemove = false;
              if (hasSrc) {
                shouldRemove = true;
              } else if (type === 'module' || type === 'text/module' || type === 'application/javascript+module') {
                shouldRemove = true;
              } else if (!type || type === 'text/javascript' || type === 'application/javascript') {
                var text = script.textContent || '';
                if (text && (/ReactDOM\./.test(text) || /hydrate(Root)?\\s*\\(/i.test(text) || /createRoot\\s*\\(/i.test(text))) {
                  shouldRemove = true;
                }
              }
              if (shouldRemove) {
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
