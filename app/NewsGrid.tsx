"use client";

import { useMemo, useState } from "react";

export type NewsPost = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  date: string;
  dateIso: string;
  views: string;
  url: string;
  image: string | null;
};

const PAGE_SIZE = 12;

export function NewsGrid({ posts }: { posts: NewsPost[] }) {
  const [active, setActive] = useState("Все");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const filters = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((post) => post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    const popular = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
      .slice(0, 9)
      .map(([tag]) => tag);
    return ["Все", ...popular];
  }, [posts]);

  const filteredPosts = useMemo(
    () => (active === "Все" ? posts : posts.filter((post) => post.tags.includes(active))),
    [active, posts]
  );
  const visiblePosts = filteredPosts.slice(0, visibleCount);

  function chooseFilter(filter: string) {
    setActive(filter);
    setVisibleCount(PAGE_SIZE);
  }

  function togglePost(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="archive-toolbar">
        <div className="filters" role="group" aria-label="Фильтр новостей по тегам">
          {filters.map((filter) => (
            <button
              key={filter}
              className={active === filter ? "is-active" : ""}
              onClick={() => chooseFilter(filter)}
              type="button"
              aria-pressed={active === filter}
            >
              {filter}
            </button>
          ))}
        </div>
        <span className="archive-toolbar__count">
          {filteredPosts.length} {filteredPosts.length === 1 ? "новость" : "новостей"}
        </span>
      </div>

      <div className="news-grid">
        {visiblePosts.map((post, index) => {
          const expanded = expandedIds.has(post.id);
          return (
            <article
              className={`news-card ${index === 0 ? "news-card--featured" : ""} ${expanded ? "is-expanded" : ""}`}
              key={post.id}
              id={`post-${post.id}`}
            >
              <button
                className="news-card__media"
                type="button"
                onClick={() => togglePost(post.id)}
                aria-label={`${expanded ? "Свернуть" : "Раскрыть"} новость: ${post.title}`}
                aria-expanded={expanded}
              >
                {post.image ? (
                  <img src={post.image} alt={`Иллюстрация к новости «${post.title}»`} loading={index > 1 ? "lazy" : "eager"} />
                ) : (
                  <span className="news-card__placeholder">
                    <span>ЛК</span><b>{post.category}</b>
                  </span>
                )}
                <span className="news-card__tag">{post.category}</span>
              </button>

              <div className="news-card__body">
                <div className="news-card__meta">
                  <time dateTime={post.dateIso}>{post.date}</time>
                  {post.views && <span>{post.views} просмотров</span>}
                </div>

                <h3>
                  <button type="button" onClick={() => togglePost(post.id)} aria-expanded={expanded}>
                    {post.title}
                  </button>
                </h3>

                <div className="news-card__tags" aria-label="Теги новости">
                  {post.tags.map((tag) => (
                    <button key={tag} type="button" onClick={() => chooseFilter(tag)}>#{tag}</button>
                  ))}
                </div>

                {expanded ? (
                  <div className="news-card__full">
                    {post.content.split(/\n+/).filter(Boolean).map((paragraph, paragraphIndex) => (
                      <p key={`${post.id}-${paragraphIndex}`}>{paragraph}</p>
                    ))}
                  </div>
                ) : (
                  <p className="news-card__summary">{post.excerpt}</p>
                )}

                <div className="news-card__actions">
                  <button className="news-card__expand" type="button" onClick={() => togglePost(post.id)} aria-expanded={expanded}>
                    {expanded ? "Свернуть ↑" : "Читать полностью ↓"}
                  </button>
                  <a className="news-card__telegram" href={post.url} target="_blank" rel="noreferrer">
                    Оригинал в Telegram ↗
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {visiblePosts.length === 0 && (
        <div className="empty-state">За последние 30 дней новостей с таким тегом нет.</div>
      )}

      <div className="more-news">
        {visibleCount < filteredPosts.length ? (
          <button className="button button--outline" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            Показать ещё {Math.min(PAGE_SIZE, filteredPosts.length - visibleCount)} ↓
          </button>
        ) : (
          <a className="button button--outline" href="https://t.me/lippot" target="_blank" rel="noreferrer">
            Все публикации в Telegram ↗
          </a>
        )}
      </div>
    </>
  );
}
