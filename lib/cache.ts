import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export type SavedPage = {
  id: string;
  url: string;
  title: string;
  savedAt: number;
  scrollY: number;
  filePath: string | null;
  mode: 'offline' | 'online';
  lastOpenedAt: number | null;
};

type Manifest = {
  pages: SavedPage[];
};

const IS_NATIVE_FS_AVAILABLE = Platform.OS !== 'web';
const ROOT_DIR = IS_NATIVE_FS_AVAILABLE ? new Directory(Paths.document, 'webcache') : null;
const PAGES_DIR = ROOT_DIR ? new Directory(ROOT_DIR, 'pages') : null;
const MANIFEST_FILE = ROOT_DIR ? new File(ROOT_DIR, 'manifest.json') : null;

let ensuredDirsPromise: Promise<void> | null = null;
let manifestCache: Manifest | null = null;
let manifestPromise: Promise<Manifest> | null = null;
const manifestIndex = new Map<string, SavedPage>();
let sortedPagesCache: SavedPage[] | null = null;
let scheduledPersist: ReturnType<typeof setTimeout> | null = null;

async function ensureDirs() {
  if (!ROOT_DIR || !PAGES_DIR) {
    return;
  }
  if (!ensuredDirsPromise) {
    ensuredDirsPromise = Promise.resolve().then(() => {
      ensureDirectory(ROOT_DIR);
      ensureDirectory(PAGES_DIR);
    });
  }
  return ensuredDirsPromise;
}

function ensureDirectory(dir: Directory) {
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

async function readManifestFromDisk(): Promise<Manifest> {
  if (!MANIFEST_FILE) {
    return { pages: [] };
  }
  await ensureDirs();
  if (!MANIFEST_FILE.exists) {
    return { pages: [] };
  }
  try {
    const content = await MANIFEST_FILE.text();
    const parsed = JSON.parse(content) as Manifest;
    if (!parsed.pages) return { pages: [] };
    const normalized = parsed.pages
      .map(normalizeSavedPage)
      .filter((page): page is SavedPage => !!page);
    return { pages: normalized };
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
      rebuildManifestIndex(manifest);
      markSortedPagesDirty();
      manifestPromise = null;
      return manifest;
    })();
  }
  return manifestPromise;
}

function clonePage(page: SavedPage): SavedPage {
  return { ...page };
}

function normalizeSavedPage(page: Partial<SavedPage> | null | undefined): SavedPage | null {
  if (!page || typeof page !== 'object') {
    return null;
  }
  const { id, url } = page as Partial<SavedPage>;
  if (typeof id !== 'string' || !id || typeof url !== 'string' || !url) {
    return null;
  }
  return {
    id,
    url,
    title: typeof page.title === 'string' && page.title ? page.title : url,
    savedAt: typeof page.savedAt === 'number' && Number.isFinite(page.savedAt) ? page.savedAt : Date.now(),
    scrollY: typeof page.scrollY === 'number' && Number.isFinite(page.scrollY) ? page.scrollY : 0,
    filePath: typeof page.filePath === 'string' && page.filePath ? page.filePath : null,
    mode: page.mode === 'online' ? 'online' : 'offline',
    lastOpenedAt: typeof page.lastOpenedAt === 'number' && Number.isFinite(page.lastOpenedAt) ? page.lastOpenedAt : null,
  };
}

function rebuildManifestIndex(manifest: Manifest) {
  manifestIndex.clear();
  for (const page of manifest.pages) {
    manifestIndex.set(page.id, page);
  }
}

function markSortedPagesDirty() {
  sortedPagesCache = null;
}

async function writeManifestToDisk(manifest: Manifest) {
  if (!MANIFEST_FILE) return;
  await ensureDirs();
  MANIFEST_FILE.write(JSON.stringify(manifest));
}

function scheduleManifestWrite() {
  if (scheduledPersist) return;
  scheduledPersist = setTimeout(() => {
    scheduledPersist = null;
    const current = manifestCache;
    if (!current) return;
    writeManifestToDisk(current).catch(() => {});
  }, 750);
}

function cancelScheduledManifestWrite() {
  if (scheduledPersist) {
    clearTimeout(scheduledPersist);
    scheduledPersist = null;
  }
}

type PersistOptions = {
  immediate?: boolean;
  invalidateSorted?: boolean;
};

async function persistManifest(manifest: Manifest, options?: PersistOptions) {
  manifestCache = manifest;
  rebuildManifestIndex(manifest);
  if (options?.invalidateSorted !== false) {
    markSortedPagesDirty();
  }
  if (options?.immediate) {
    cancelScheduledManifestWrite();
    await writeManifestToDisk(manifest);
  } else {
    scheduleManifestWrite();
  }
}

function getSortedPages(manifest: Manifest): SavedPage[] {
  if (!sortedPagesCache) {
    sortedPagesCache = [...manifest.pages].sort((a, b) => b.savedAt - a.savedAt);
  }
  return sortedPagesCache;
}

function makeId(): string {
  // Simple unique id
  return Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

export async function listSavedPages(): Promise<SavedPage[]> {
  const manifest = await loadManifest();
  return getSortedPages(manifest).map(clonePage);
}

export async function getSavedPage(id: string): Promise<SavedPage | null> {
  if (!id) return null;
  await loadManifest();
  const page = manifestIndex.get(id);
  return page ? clonePage(page) : null;
}

type AddSavedPageParams = {
  url: string;
  title: string;
  html?: string;
  scrollY: number;
  mode?: 'offline' | 'online';
};

export async function addSavedPage(params: AddSavedPageParams): Promise<SavedPage> {
  const mode: 'offline' | 'online' = params.mode === 'online' ? 'online' : 'offline';
  if (mode === 'offline' && !PAGES_DIR) {
    throw new Error('Persistent storage is not available on this platform.');
  }
  if (mode === 'offline' && !params.html) {
    throw new Error('HTML content is required for offline saves.');
  }
  await ensureDirs();
  const id = makeId();
  let filePath: string | null = null;
  if (mode === 'offline' && PAGES_DIR) {
    const pageFile = new File(PAGES_DIR, `${id}.html`);
    pageFile.write(params.html as string);
    filePath = pageFile.uri;
  }
  const m = await loadManifest();
  const page: SavedPage = {
    id,
    url: params.url,
    title: params.title || params.url,
    savedAt: Date.now(),
    scrollY: params.scrollY || 0,
    filePath,
    mode,
    lastOpenedAt: null,
  };
  m.pages.push(page);
  manifestIndex.set(page.id, page);
  await persistManifest(m, { immediate: true });
  return page;
}

export async function updateScrollY(id: string, scrollY: number): Promise<void> {
  const manifest = await loadManifest();
  const page = manifestIndex.get(id);
  if (!page) return;
  page.scrollY = scrollY;
  await persistManifest(manifest, { invalidateSorted: false });
}

export async function readSavedHtml(id: string): Promise<{ html: string; baseUrl: string | null } | null> {
  if (!IS_NATIVE_FS_AVAILABLE) {
    return null;
  }
  await loadManifest();
  const page = manifestIndex.get(id);
  if (!page || page.mode !== 'offline' || !page.filePath) return null;
  const htmlFile = new File(page.filePath);
  const html = await htmlFile.text();
  // Derive baseUrl from original url's origin, so relative links resolve if online
  try {
    const u = new URL(page.url);
    return { html, baseUrl: `${u.protocol}//${u.host}` };
  } catch {
    return { html, baseUrl: null };
  }
}

export async function removeSavedPage(id: string): Promise<void> {
  if (!IS_NATIVE_FS_AVAILABLE) {
    return;
  }
  const m = await loadManifest();
  const page = manifestIndex.get(id);
  if (!page) return;
  const idx = m.pages.indexOf(page);
  if (idx === -1) return;
  try {
    if (page.filePath) {
      const file = new File(page.filePath);
      if (file.exists) {
        file.delete();
      }
    }
  } catch {}
  m.pages.splice(idx, 1);
  manifestIndex.delete(id);
  await persistManifest(m, { immediate: true });
}

export async function markPageOpened(id: string): Promise<void> {
  if (!id) return;
  const manifest = await loadManifest();
  const page = manifestIndex.get(id);
  if (!page) {
    return;
  }
  page.lastOpenedAt = Date.now();
  await persistManifest(manifest, { invalidateSorted: false });
}

export async function clearRecentOpens(): Promise<void> {
  const manifest = await loadManifest();
  let changed = false;
  for (const page of manifest.pages) {
    if (typeof page.lastOpenedAt === 'number' && page.lastOpenedAt > 0) {
      page.lastOpenedAt = null;
      changed = true;
    }
  }
  if (changed) {
    await persistManifest(manifest, { invalidateSorted: false });
  }
}

export async function initializeCache(): Promise<void> {
  if (!IS_NATIVE_FS_AVAILABLE) {
    return;
  }
  await loadManifest();
}
