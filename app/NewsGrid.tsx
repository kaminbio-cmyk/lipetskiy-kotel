"use client";

import { useMemo, useState } from "react";

export type NewsPost = {
  id: string;
  title: string;
  excerpt: string;
  category: "Город" | "Власть" | "Экономика" | "Общество";
  date: string;
  views: string;
  url: string;
  image: string | null;
};

const filters = ["Все", "Город", "Власть", "Экономика", "Общество"] as const;

export function NewsGrid({ posts }: { posts: NewsPost[] }) {
  const [active, setActive] = useState<(typeof filters)[number]>("Все");
  const visiblePosts = useMemo(
    () => (active === "Все" ? posts : posts.filter((post) => post.category === active)),
    [active, posts]
  );

  return (
    <>
      <div className="filters" role="group" aria-label="Фильтр новостей">
        {filters.map((filter) => (
          <button
            key={filter}
            className={active === filter ? "is-active" : ""}
            onClick={() => setActive(filter)}
            type="button"
            aria-pressed={active === filter}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="news-grid">
        {visiblePosts.map((post, index) => (
          <article className={`news-card ${index === 0 ? "news-card--featured" : ""}`} key={post.id}>
            <a className="news-card__media" href={post.url} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden="true">
              {post.image ? (
                <img src={post.image} alt="" loading={index > 1 ? "lazy" : "eager"} />
              ) : (
                <span className={`news-card__placeholder placeholder--${post.category.toLowerCase()}`}>
                  <span>ЛК</span><b>{post.category}</b>
                </span>
              )}
              <span className="news-card__tag">{post.category}</span>
            </a>
            <div className="news-card__body">
              <div className="news-card__meta">
                <time>{post.date}</time>
                {post.views && <span>{post.views} просмотров</span>}
              </div>
              <h3><a href={post.url} target="_blank" rel="noreferrer">{post.title}</a></h3>
              <p>{post.excerpt}</p>
              <a className="news-card__link" href={post.url} target="_blank" rel="noreferrer">Читать в Telegram <span>↗</span></a>
            </div>
          </article>
        ))}
      </div>

      {visiblePosts.length === 0 && (
        <div className="empty-state">В этой рубрике пока нет свежих публикаций.</div>
      )}

      <div className="more-news">
        <a className="button button--outline" href="https://t.me/lippot" target="_blank" rel="noreferrer">Все публикации в Telegram ↗</a>
      </div>
    </>
  );
}
