import * as FileSystem from 'expo-file-system';

import type { SavedPage } from './cache';

const MAX_CACHE_ENTRIES = 6;
const htmlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function touch(id: string, html: string) {
  htmlCache.delete(id);
  htmlCache.set(id, html);
  while (htmlCache.size > MAX_CACHE_ENTRIES) {
    const oldest = htmlCache.keys().next().value;
    if (typeof oldest === 'string') {
      htmlCache.delete(oldest);
    } else {
      break;
    }
  }
}

export function getCachedPageHtml(id: string | null | undefined): string | null {
  if (!id) return null;
  return htmlCache.get(id) ?? null;
}

export function cachePageHtml(id: string | null | undefined, html: string | null | undefined): void {
  if (!id || typeof html !== 'string' || !html) return;
  touch(id, html);
}

export async function preloadPageHtml(page: SavedPage | null | undefined): Promise<string | null> {
  if (!page || !page.id || !page.filePath) return null;
  const existing = htmlCache.get(page.id);
  if (existing) return existing;
  if (inflight.has(page.id)) {
    return inflight.get(page.id) ?? null;
  }
  const job = (async () => {
    try {
      const html = await FileSystem.readAsStringAsync(page.filePath);
      cachePageHtml(page.id, html);
      return html;
    } catch {
      return null;
    } finally {
      inflight.delete(page.id);
    }
  })();
  inflight.set(page.id, job);
  return job;
}

export function invalidatePageHtml(id?: string): void {
  if (id) {
    htmlCache.delete(id);
    inflight.delete(id);
  } else {
    htmlCache.clear();
    inflight.clear();
  }
}
