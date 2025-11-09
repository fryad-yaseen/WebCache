import type { SavedPage } from './cache';
import { initializeCache, listSavedPages } from './cache';
import { MAX_CACHE_ENTRIES, preloadPageHtml } from './page-html-cache';

const DEFAULT_WARM_LIMIT = MAX_CACHE_ENTRIES;
let warmPromise: Promise<void> | null = null;

async function warmTopPages(limit: number) {
  const pages = await listSavedPages();
  const cappedLimit = Math.max(0, Math.min(limit, MAX_CACHE_ENTRIES));
  const targets: SavedPage[] = pages.slice(0, cappedLimit);
  await Promise.allSettled(targets.map((page) => preloadPageHtml(page)));
}

export async function warmSavedPages(limit = DEFAULT_WARM_LIMIT): Promise<void> {
  if (warmPromise) {
    return warmPromise;
  }
  warmPromise = (async () => {
    await initializeCache();
    await warmTopPages(limit);
  })();
  try {
    await warmPromise;
  } finally {
    warmPromise = null;
  }
}
