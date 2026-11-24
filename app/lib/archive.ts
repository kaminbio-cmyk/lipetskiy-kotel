// Источники данных для браузера: на основном сайте — серверные адреса /api/*, в статичной копии на хостинге — готовые файлы /data/*.json.
import type { NewsPost } from "./telegram";

let archivePromise: Promise<NewsPost[]> | null = null;
let archiveLoaded: NewsPost[] | null = null;

function plain(post: NewsPost) {
  return `${post.title} ${post.excerpt} ${post.tags.join(" ")} ${post.html.replace(/<[^>]+>/g, " ")}`.toLowerCase();
}

/** Архив за 90 дней статичной копии (/data/archive.json) — грузится один раз на страницу. */
export function loadArchive(): Promise<NewsPost[]> {
  archivePromise ??= fetch("/data/archive.json", { cache: "no-cache" })
    .then((response) => response.json())
    .then((data: { posts?: NewsPost[] }) => (archiveLoaded = data.posts ?? []))
    .catch(() => {
      archivePromise = null;
      return [];
    });
  return archivePromise;
}

/** Публикация (или её «продолжение») по номеру сообщения — из уже загруженного архива, без ожидания. */
export function cachedArchivePost(id: string): NewsPost | null {
  return archiveLoaded?.find((post) => post.id === id || post.parts.includes(id)) ?? null;
}

/** Поиск по архиву канала. */
export async function searchArchive(query: string, staticMode: boolean, signal?: AbortSignal): Promise<NewsPost[]> {
  if (!staticMode) {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
    const data = (await response.json()) as { posts?: NewsPost[] };
    return data.posts ?? [];
  }
  const all = await loadArchive();
  if (signal?.aborted) return [];
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 1);
  if (!words.length) return [];
  return all.filter((post) => words.every((word) => plain(post).includes(word))).slice(0, 40);
}

/** Новые публикации после `since` — для плашки «N новых публикаций». */
export async function fetchLatest(since: number, staticMode: boolean): Promise<NewsPost[]> {
  const url = staticMode ? `/data/latest.json?t=${Math.floor(Date.now() / 60000)}` : `/api/feed?since=${since}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json()) as { posts?: NewsPost[] };
  return (data.posts ?? []).filter((post) => Number(post.id) > since);
}
