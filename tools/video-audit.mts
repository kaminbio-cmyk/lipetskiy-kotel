// Разбор: какие видео и ссылки на видео в канале @lippot. node tools/video-audit.mts [страниц]
// Читает t.me/s/lippot напрямую (как сборщик), ничего не скачивает.
const PAGES = Number(process.argv[2] || 40);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

let before: number | null = null;
let blocks = 0, withVideo = 0, multiVideo = 0, noSrc = 0, roundVideo = 0, oldest = "";
const notSupported: string[] = [];
const links = new Map<string, string[]>();
const sizes: number[] = [];
const sampleSrc: string[] = [];

for (let page = 0; page < PAGES; page++) {
  const url = before ? `https://t.me/s/lippot?before=${before}` : "https://t.me/s/lippot";
  const html = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
  const parts = html.split('<div class="tgme_widget_message_wrap').slice(1);
  if (!parts.length) break;
  let minId = Infinity;
  for (const block of parts) {
    const id = Number(block.match(/data-post="lippot\/(\d+)"/)?.[1]);
    const date = block.match(/<time datetime="([^"]+)"/)?.[1] ?? "";
    if (!id) continue;
    minId = Math.min(minId, id);
    oldest = date;
    blocks++;
    const players = block.match(/tgme_widget_message_video_player/g)?.length ?? 0;
    const srcs = [...block.matchAll(/<video src="([^"]+)"/g)].map((m) => m[1]);
    if (/tgme_widget_message_roundvideo/.test(block)) roundVideo++;
    if (players) {
      withVideo++;
      if (players > 1) multiVideo++;
      if (srcs.length < players) { noSrc++; notSupported.push(`${id} ${date.slice(0, 10)} players=${players} src=${srcs.length}`); }
      if (sampleSrc.length < 6) sampleSrc.push(...srcs.map((s) => `${id}: ${s.slice(0, 90)}`));
    }
    // ссылки в тексте
    const text = block.match(/<div class="tgme_widget_message_text[\s\S]*?<\/div>/)?.[0] ?? "";
    for (const m of text.matchAll(/href="([^"]+)"/g)) {
      const href = m[1].replace(/&amp;/g, "&");
      let kind = "";
      if (/youtube\.com|youtu\.be/.test(href)) kind = "youtube";
      else if (/rutube\.ru/.test(href)) kind = "rutube";
      else if (/vk\.(com|ru)\/(video|clip)|vkvideo\.ru/.test(href)) kind = "vk-video";
      else if (/dzen\.ru\/(video|shorts)/.test(href)) kind = "dzen";
      else if (/t\.me\/(?!s\/)[\w]+\/\d+/.test(href)) kind = "t.me-post";
      else if (/\.(mp4|mov|webm)(\?|$)/i.test(href)) kind = "file";
      if (kind) links.set(kind, [...(links.get(kind) ?? []), `${id}: ${href}`]);
    }
  }
  if (!Number.isFinite(minId)) break;
  before = minId;
}

console.log(`Сообщений: ${blocks}, до ${oldest.slice(0, 10)}`);
console.log(`С видео: ${withVideo}, из них альбомов с несколькими видео: ${multiVideo}, кружков: ${roundVideo}`);
console.log(`Видео без прямой ссылки (Telegram отдаёт только «смотреть в Telegram»): ${noSrc}`);
for (const line of notSupported.slice(0, 15)) console.log("  ", line);
console.log("Примеры ссылок на видео:", sampleSrc.slice(0, 3));
for (const [kind, list] of links) {
  console.log(`Ссылки ${kind}: ${list.length}`);
  for (const line of list.slice(0, 8)) console.log("  ", line);
}
