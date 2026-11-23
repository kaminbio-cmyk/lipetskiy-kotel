import { searchChannel } from "../../lib/telegram";

export const dynamic = "force-dynamic";

/** Поиск по всему архиву канала @lippot: /api/search?q=бюджет */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const posts = await searchChannel(q);
  return Response.json(
    { q, posts },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
