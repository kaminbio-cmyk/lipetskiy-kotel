// Сборщик статичной копии «Липецкого котла» для хостинга без доступа к Telegram (SpaceWeb).
// Берёт ленту @lippot за 30 дней и архив за 90 дней, скачивает к себе фото и все ролики (и ленты, и архива), готовит файлы данных.
// Ролики, которые Telegram отдаёт только в своём приложении, и файлы больше 95 МБ остаются ссылкой на Telegram.
//
//   node tools/build-static-feed.mts --out public --prev <папка прошлой сборки>
//
// Пишет:
//   app/lib/static-feed.json    — лента за 30 дней (страница собирается из неё);
//   <out>/media/*               — фото, обложки видео и сами видео;
//   <out>/data/latest.json      — свежие посты для плашки «новые публикации»;
//   <out>/data/archive.json     — архив за 90 дней для поиска;
//   <out>/data/feed-hash.txt    — отпечаток данных: если не изменился, пересобирать сайт не нужно.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(ROOT, arg("out", "public"));
const PREV = arg("prev") ? path.resolve(arg("prev")) : "";
const ORIGIN = process.env.LK_SITE_ORIGIN || "https://lk48.ru";
const FEED_DAYS = 30;
const ARCHIVE_DAYS = 90;
const MAX_VIDEO_BYTES = 95 * 1024 * 1024; // крупнее — оставляем ссылку на Telegram (GitHub не принимает файлы больше 100 МБ)

// telegram.ts импортирует static-feed.json без атрибутов импорта — Node так не умеет. Берём копию модуля без этой строки.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-feed-"));
const src = fs
  .readFileSync(path.join(ROOT, "app/lib/telegram.ts"), "utf8")
  .replace(/import staticFeedJson from "\.\/static-feed\.json";/, "const staticFeedJson = null;");
const tmpModule = path.join(tmpDir, "telegram.mts");
fs.writeFileSync(tmpModule, src);
const tg = await import(pathToFileURL(tmpModule).href);

type Media = { src: string; ratio: number | null };
type Post = {
  id: string; title: string; excerpt: string; html: string; category: string; tags: string[];
  images: Media[]; video: Video | null; videos?: Video[];
  cover: string | null; dateIso: string; [key: string]: unknown;
};
type Video = { thumb: string; duration: string; src: string | null; ratio: number | null };

const mediaDir = path.join(OUT, "media");
const dataDir = path.join(OUT, "data");
fs.mkdirSync(mediaDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

/** Исходная ссылка Telegram из адреса вида /api/img?u=... */
function rawUrl(url: string) {
  if (url.startsWith("/api/img?u=")) return decodeURIComponent(url.slice("/api/img?u=".length));
  return url;
}

const extOf = (type: string, fallback: string) =>
  /png/.test(type) ? ".png" : /webp/.test(type) ? ".webp" : /gif/.test(type) ? ".gif" : /mp4|video/.test(type) ? ".mp4" : /jpe?g|image/.test(type) ? ".jpg" : fallback;

const used = new Set<string>();
let downloaded = 0, reused = 0, skippedVideos = 0, failed = 0, noLocalVideo = 0, telegramOnly = 0;

/** Скачать файл под постоянным именем (или взять из прошлой сборки). Возвращает адрес /media/... или null. */
async function fetchMedia(url: string, base: string, fallbackExt: string, maxBytes = 25 * 1024 * 1024): Promise<string | null> {
  for (const ext of [fallbackExt, ".jpg", ".png", ".webp", ".mp4", ".gif"]) {
    const name = base + ext;
    const here = path.join(mediaDir, name);
    const prev = PREV ? path.join(PREV, "media", name) : "";
    if (fs.existsSync(here) && fs.statSync(here).size > 0) { used.add(name); reused++; return `/media/${name}`; }
    if (prev && fs.existsSync(prev) && fs.statSync(prev).size > 0) {
      fs.copyFileSync(prev, here); used.add(name); reused++; return `/media/${name}`;
    }
  }
  try {
    const response = await fetch(rawUrl(url), { signal: AbortSignal.timeout(120_000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error(String(response.status));
    const length = Number(response.headers.get("content-length") || 0);
    if (length > maxBytes) { await response.body?.cancel(); skippedVideos++; return null; }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) { skippedVideos++; return null; }
    const name = base + extOf(response.headers.get("content-type") || "", fallbackExt);
    fs.writeFileSync(path.join(mediaDir, name), buffer);
    used.add(name); downloaded++;
    return `/media/${name}`;
  } catch {
    failed++;
    return null;
  }
}

async function localize(post: Post) {
  const images: Media[] = [];
  for (let i = 0; i < post.images.length; i++) {
    const local = await fetchMedia(post.images[i].src, `${post.id}-${i + 1}`, ".jpg");
    if (local) images.push({ ...post.images[i], src: local });
  }
  post.images = images;
  // Все ролики публикации: первый под прежними именами (<id>-vt.jpg, <id>-v.mp4), следующие — <id>-v2t.jpg, <id>-v2.mp4 …
  const source = post.videos?.length ? post.videos : post.video ? [post.video] : [];
  const videos: Video[] = [];
  for (let i = 0; i < source.length; i++) {
    const tag = i === 0 ? "v" : `v${i + 1}`;
    const thumb = await fetchMedia(source[i].thumb, `${post.id}-${tag}t`, ".jpg");
    if (!thumb) continue;
    const video = source[i].src ? await fetchMedia(source[i].src!, `${post.id}-${tag}`, ".mp4", MAX_VIDEO_BYTES) : null;
    if (source[i].src && !video) noLocalVideo++;
    if (!source[i].src) telegramOnly++;
    videos.push({ ...source[i], thumb, src: video });
  }
  post.videos = videos;
  post.video = videos[0] ?? null;
  if (!post.images.length && !post.video && !post.cover) post.cover = tg.coverFor(post.category, post.id);
  return post;
}

const started = Date.now();
const archiveFeed = await tg.loadFromTelegram(ARCHIVE_DAYS, 90);
if (!archiveFeed.posts.length) throw new Error("Telegram не отдал ни одного поста — сборку не обновляем");
const cutoff = Date.now() - FEED_DAYS * 24 * 60 * 60 * 1000;
const recent = (archiveFeed.posts as Post[]).filter((post) => new Date(post.dateIso).getTime() >= cutoff);
const older = (archiveFeed.posts as Post[]).filter((post) => new Date(post.dateIso).getTime() < cutoff);

const localized: Post[] = [];
for (const post of recent) localized.push(await localize(structuredClone(post)));
// Архив (31–90 дней) — тоже с фото и видео: его открывают из поиска и по ссылкам внутри статей.
const olderLocalized: Post[] = [];
for (const post of older) olderLocalized.push(await localize(structuredClone(post)));

const feed = {
  ...archiveFeed,
  posts: localized,
  completeMonth: true,
  static: { origin: ORIGIN.replace(/\/$/, "") },
};
fs.writeFileSync(path.join(ROOT, "app/lib/static-feed.json"), JSON.stringify(feed));
fs.writeFileSync(path.join(dataDir, "latest.json"), JSON.stringify({ posts: localized.slice(0, 24), fetchedAt: feed.fetchedAt }));
fs.writeFileSync(path.join(dataDir, "archive.json"), JSON.stringify({ posts: [...localized, ...olderLocalized], fetchedAt: feed.fetchedAt }));

// Убрать файлы постов, ушедших из ленты.
let removed = 0;
for (const name of fs.readdirSync(mediaDir)) if (!used.has(name)) { fs.rmSync(path.join(mediaDir, name)); removed++; }

// Отпечаток данных без времени выгрузки: одинаковый — значит, на канале ничего не поменялось.
const fingerprint = crypto
  .createHash("sha1")
  .update(JSON.stringify({ ...feed, fetchedAt: 0 }))
  .update(JSON.stringify(olderLocalized.map((post) => [post.id, post.images.length, (post.videos ?? []).map((video) => video.src)])))
  .digest("hex");
fs.writeFileSync(path.join(dataDir, "feed-hash.txt"), fingerprint + "\n");

const videos = [...localized, ...olderLocalized].reduce((sum, post) => sum + (post.videos ?? []).filter((video) => video.src).length, 0);
console.log(
  `Лента: ${localized.length} постов за ${FEED_DAYS} дн., архив: ${older.length} старше; ` +
  `роликов на хостинге: ${videos}, только в Telegram: ${telegramOnly}, слишком крупных или не скачалось: ${noLocalVideo} (крупных ${skippedVideos}); ` +
  `файлов скачано ${downloaded}, взято из прошлой сборки ${reused}, ` +
  `не скачалось ${failed}, удалено ${removed}; ${Math.round((Date.now() - started) / 1000)} с; отпечаток ${fingerprint.slice(0, 12)}`
);
fs.rmSync(tmpDir, { recursive: true, force: true });
