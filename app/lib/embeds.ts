// Ссылки на видео в тексте публикаций (YouTube, VK Видео, Rutube) — показываем плеером прямо в статье,
// чтобы ролик смотрели на сайте, не уходя по ссылке.

export type VideoEmbed = { kind: "youtube" | "vk" | "rutube"; label: string; url: string; src: string };

/** Плеер для одной ссылки или null, если ссылка не на видео. */
export function embedFor(href: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(href.replace(/&amp;/g, "&"));
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");

  if (host === "youtu.be" || host === "youtube.com" || host === "music.youtube.com") {
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1).split("/")[0]
        : url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/)?.[1] ?? "";
    if (!/^[\w-]{6,}$/.test(id)) return null;
    const start = Number.parseInt(url.searchParams.get("t") ?? url.searchParams.get("start") ?? "", 10);
    return {
      kind: "youtube",
      label: "YouTube",
      url: href,
      src: `https://www.youtube-nocookie.com/embed/${id}?rel=0${Number.isFinite(start) && start > 0 ? `&start=${start}` : ""}`,
    };
  }

  if (host === "vk.com" || host === "vk.ru" || host === "vkvideo.ru") {
    const fromPath = url.pathname.match(/\/(?:video|clip)(-?\d+)_(\d+)/);
    const fromQuery = (url.searchParams.get("z") ?? "").match(/(?:video|clip)(-?\d+)_(\d+)/);
    const match = fromPath ?? fromQuery;
    if (!match) return null;
    return { kind: "vk", label: "VK Видео", url: href, src: `https://vkvideo.ru/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2` };
  }

  if (host === "rutube.ru") {
    const id = url.pathname.match(/^\/(?:video|shorts|play\/embed)\/([\da-f]{20,})/i)?.[1];
    if (!id) return null;
    return { kind: "rutube", label: "Rutube", url: href, src: `https://rutube.ru/play/embed/${id}` };
  }

  return null;
}

/** Все видео-ссылки из html публикации, без повторов. */
export function videoEmbeds(html: string): VideoEmbed[] {
  const seen = new Set<string>();
  const list: VideoEmbed[] = [];
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const embed = embedFor(match[1]);
    if (embed && !seen.has(embed.src)) {
      seen.add(embed.src);
      list.push(embed);
    }
  }
  return list;
}
