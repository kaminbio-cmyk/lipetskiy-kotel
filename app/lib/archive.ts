// Источники данных для браузера: на основном сайте — серверные адреса /api/*, в статичной копии на хостинге — готовые файлы /data/*.json.
import type { NewsPost } from "./telegram";

let archivePromise: Promise<NewsPost[]> | null = null;

function plain(post: NewsPost) {
  return `${post.title} ${post.excerpt} ${post.tags.join(" ")} ${post.html.replace(/<[^>]+>/g, " ")}`.toLowerCase();
}

/** Поиск по архиву канала. */
export async function searchArchive(query: string, staticMode: boolean, signal?: AbortSignal): Promise<NewsPost[]> {
  if (!staticMode) {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
    const data = (await response.json()) as { posts?: NewsPost[] };
    return data.posts ?? [];
  }
  archivePromise ??= fetch("/data/archive.json", { cache: "no-cache" })
    .then((response) => response.json())
    .then((data: { posts?: NewsPost[] }) => data.posts ?? [])
    .catch(() => {
      archivePromise = null;
      return [];
    });
  const all = await archivePromise;
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
