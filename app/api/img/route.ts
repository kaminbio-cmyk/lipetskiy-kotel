import { MEDIA_HOSTS, edgeCache } from "../../lib/telegram";

export const dynamic = "force-dynamic";

const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

/**
 * Фото и видео канала с адреса сайта: /api/img?u=<ссылка на сервер Telegram>.
 * Пропускает только медиа-серверы Telegram и только картинки и видео — открытым прокси не служит.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !MEDIA_HOSTS.test(target.hostname)) {
    return new Response("Forbidden", { status: 403 });
  }

  const range = request.headers.get("range");
  const cache = edgeCache();
  const key = new Request(target.toString());

  if (!range && cache) {
    try {
      const hit = await cache.match(key);
      // Ответ из кеша неизменяемый — копируем, иначе сервер не может дописать свои заголовки (ошибка 500).
      if (hit) return new Response(hit.body, { status: hit.status, headers: new Headers(hit.headers) });
    } catch {
      /* без кеша идём к Telegram */
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        ...(range ? { Range: range } : {}),
      },
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return new Response("Upstream timeout", { status: 504 });
  }

  const type = upstream.headers.get("content-type") ?? "";
  if (!(upstream.ok || upstream.status === 206) || !/^(image|video)\//i.test(type)) {
    return new Response("Upstream error", { status: 502 });
  }

  const headers = new Headers();
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", "public, max-age=604800, immutable");
  headers.set("X-Content-Type-Options", "nosniff");

  const response = new Response(upstream.body, { status: upstream.status, headers });
  if (!range && upstream.status === 200 && cache) {
    try {
      await cache.put(key, response.clone());
    } catch {
      /* не закешировалось — отдадим и так */
    }
  }
  return response;
}
