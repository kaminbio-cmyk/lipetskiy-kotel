import { getFeed } from "../../lib/telegram";

export const dynamic = "force-dynamic";

/** Свежие публикации для живого обновления ленты: /api/feed?since=<номер последней показанной>. */
export async function GET(request: Request) {
  const since = Number(new URL(request.url).searchParams.get("since") ?? 0) || 0;
  const feed = await getFeed();
  const posts = since ? feed.posts.filter((post) => Number(post.id) > since) : feed.posts.slice(0, 24);
  return Response.json(
    { posts, live: feed.live, fetchedAt: feed.fetchedAt, subscribers: feed.channel.subscribers },
    { headers: { "Cache-Control": "no-store" } }
  );
}
