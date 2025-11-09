import * as FileSystem from 'expo-file-system';

export type SavedPage = {
  id: string;
  url: string;
  title: string;
  savedAt: number;
  scrollY: number;
  filePath: string;
};

type Manifest = {
  pages: SavedPage[];
};

const ROOT_DIR = FileSystem.documentDirectory + 'webcache/';
const PAGES_DIR = ROOT_DIR + 'pages/';
const MANIFEST_PATH = ROOT_DIR + 'manifest.json';

let ensuredDirsPromise: Promise<void> | null = null;
let manifestCache: Manifest | null = null;
let manifestPromise: Promise<Manifest> | null = null;

async function ensureDirs() {
  if (!ensuredDirsPromise) {
    ensuredDirsPromise = (async () => {
      const rootInfo = await FileSystem.getInfoAsync(ROOT_DIR);
      if (!rootInfo.exists) {
        await FileSystem.makeDirectoryAsync(ROOT_DIR, { intermediates: true });
      }
      const pagesInfo = await FileSystem.getInfoAsync(PAGES_DIR);
      if (!pagesInfo.exists) {
        await FileSystem.makeDirectoryAsync(PAGES_DIR, { intermediates: true });
      }
    })();
  }
  return ensuredDirsPromise;
}

async function readManifestFromDisk(): Promise<Manifest> {
  await ensureDirs();
  const info = await FileSystem.getInfoAsync(MANIFEST_PATH);
  if (!info.exists) {
    return { pages: [] };
  }
  try {
    const content = await FileSystem.readAsStringAsync(MANIFEST_PATH);
    const parsed = JSON.parse(content) as Manifest;
    if (!parsed.pages) return { pages: [] };
    return { pages: parsed.pages.map(clonePage) };
  } catch {
    return { pages: [] };
  }
}

async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const manifest = await readManifestFromDisk();
      manifestCache = manifest;
      manifestPromise = null;
      return manifest;
    })();
  }
  return manifestPromise;
}

async function persistManifest(manifest: Manifest) {
  manifestCache = manifest;
  await ensureDirs();
  await FileSystem.writeAsStringAsync(MANIFEST_PATH, JSON.stringify(manifest));
}

function clonePage(page: SavedPage): SavedPage {
  return { ...page };
}

function makeId(): string {
  // Simple unique id
  return Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

export async function listSavedPages(): Promise<SavedPage[]> {
  const manifest = await loadManifest();
  return manifest.pages
    .map(clonePage)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function getSavedPage(id: string): Promise<SavedPage | null> {
  if (!id) return null;
  const manifest = await loadManifest();
  const page = manifest.pages.find((p) => p.id === id);
  return page ? clonePage(page) : null;
}

export async function addSavedPage(params: {
  url: string;
  title: string;
  html: string;
  scrollY: number;
}): Promise<SavedPage> {
  await ensureDirs();
  const id = makeId();
  const filePath = `${PAGES_DIR}${id}.html`;
  await FileSystem.writeAsStringAsync(filePath, params.html);
  const m = await loadManifest();
  const page: SavedPage = {
    id,
    url: params.url,
    title: params.title || params.url,
    savedAt: Date.now(),
    scrollY: params.scrollY || 0,
    filePath,
  };
  m.pages.push(page);
  await persistManifest(m);
  return page;
}

export async function updateScrollY(id: string, scrollY: number): Promise<void> {
  const manifest = await loadManifest();
  const idx = manifest.pages.findIndex((p) => p.id === id);
  if (idx === -1) return;
  manifest.pages[idx].scrollY = scrollY;
  await persistManifest(manifest);
}

export async function readSavedHtml(id: string): Promise<{ html: string; baseUrl: string | null } | null> {
  const m = await loadManifest();
  const page = m.pages.find((p) => p.id === id);
  if (!page) return null;
  const html = await FileSystem.readAsStringAsync(page.filePath);
  // Derive baseUrl from original url's origin, so relative links resolve if online
  try {
    const u = new URL(page.url);
    return { html, baseUrl: `${u.protocol}//${u.host}` };
  } catch {
    return { html, baseUrl: null };
  }
}

export async function removeSavedPage(id: string): Promise<void> {
  const m = await loadManifest();
  const idx = m.pages.findIndex((p) => p.id === id);
  if (idx === -1) return;
  const page = m.pages[idx];
  try {
    const info = await FileSystem.getInfoAsync(page.filePath);
    if (info.exists) {
      await FileSystem.deleteAsync(page.filePath, { idempotent: true });
    }
  } catch {}
  m.pages.splice(idx, 1);
  await persistManifest(m);
}

export async function initializeCache(): Promise<void> {
  await loadManifest();
}
