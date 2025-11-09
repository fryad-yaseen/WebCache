import type { SavedPage } from './cache';
import { initializeCache, listSavedPages } from './cache';
import { preloadPageHtml } from './page-html-cache';

const DEFAULT_WARM_LIMIT = 5;
let warmPromise: Promise<void> | null = null;

async function warmTopPages(limit: number) {
  const pages = await listSavedPages();
  const targets: SavedPage[] = pages.slice(0, Math.max(0, limit));
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
