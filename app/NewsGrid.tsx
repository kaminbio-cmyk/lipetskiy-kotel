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

function pluralNews(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "новость";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "новости";
  return "новостей";
}

export function NewsGrid({ posts }: { posts: NewsPost[] }) {
  const [active, setActive] = useState("Все");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    setExpandedId(null);
  }

  function openPost(id: string) {
    setExpandedId(id);
    window.setTimeout(() => document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function closePost(id: string) {
    setExpandedId(null);
    window.setTimeout(() => document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
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
          {filteredPosts.length} {pluralNews(filteredPosts.length)}
        </span>
      </div>

      <div className="news-grid">
        {visiblePosts.map((post) => {
          const expanded = expandedId === post.id;

          if (expanded) {
            return (
              <article className="article-view" key={post.id} id={`post-${post.id}`}>
                <div className="article-view__topline">
                  <div className="breadcrumbs">Главная&nbsp;&nbsp;·&nbsp;&nbsp;{post.category}&nbsp;&nbsp;·&nbsp;&nbsp;{post.title}</div>
                  <button type="button" onClick={() => closePost(post.id)} aria-label="Свернуть статью">Закрыть ×</button>
                </div>
                <h2>{post.title}</h2>
                <div className="article-view__meta">
                  <span>{post.category}</span>
                  <time dateTime={post.dateIso}>{post.date}</time>
                  {post.views && <span>{post.views} просмотров</span>}
                </div>
                {post.excerpt && <p className="article-view__lead">{post.excerpt}</p>}
                <div className="article-view__media">
                  {post.image ? (
                    <img src={post.image} alt={`Иллюстрация к новости «${post.title}»`} />
                  ) : (
                    <span className="article-view__placeholder">ЛК <small>{post.category}</small></span>
                  )}
                </div>
                <div className="article-view__caption">Фото: публикация Telegram-канала «Липецкий котёл»</div>
                <div className="article-view__content">
                  {post.content.split(/\n+/).filter(Boolean).map((paragraph, paragraphIndex) => (
                    <p key={`${post.id}-${paragraphIndex}`}>{paragraph}</p>
                  ))}
                </div>
                <div className="article-view__tags" aria-label="Теги новости">
                  {post.tags.map((tag) => (
                    <button key={tag} type="button" onClick={() => chooseFilter(tag)}>#{tag}</button>
                  ))}
                </div>
                <div className="article-view__actions">
                  <button className="button button--light" type="button" onClick={() => closePost(post.id)}>Свернуть статью ↑</button>
                  <a className="button button--primary" href={post.url} target="_blank" rel="noreferrer">Оригинал в Telegram ↗</a>
                </div>
              </article>
            );
          }

          return (
            <article className="news-card" key={post.id} id={`post-${post.id}`}>
              <button
                className={`news-card__media${post.image ? "" : " is-empty"}`}
                type="button"
                onClick={() => openPost(post.id)}
                aria-label={`Открыть новость: ${post.title}`}
              >
                {post.image ? (
                  <img src={post.image} alt={`Иллюстрация к новости «${post.title}»`} loading="lazy" />
                ) : (
                  <span className="news-card__placeholder"><strong>ЛК</strong><small>{post.category}</small></span>
                )}
                <span className="news-card__ribbon"><b>{post.category}</b><time dateTime={post.dateIso}>{post.date}</time></span>
              </button>
              <div className="news-card__body">
                <h3><button type="button" onClick={() => openPost(post.id)}>{post.title}</button></h3>
                <p>{post.excerpt}</p>
                <div className="news-card__footer">
                  <span>{post.views ? `${post.views} просмотров` : "@lippot"}</span>
                  <button type="button" onClick={() => openPost(post.id)}>Читать →</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {visiblePosts.length === 0 && <div className="empty-state">За последние 30 дней новостей с таким тегом нет.</div>}

      <div className="more-news">
        {visibleCount < filteredPosts.length ? (
          <button className="button button--light" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            Показать ещё {Math.min(PAGE_SIZE, filteredPosts.length - visibleCount)}
          </button>
        ) : (
          <a className="button button--light" href="https://t.me/lippot" target="_blank" rel="noreferrer">Все публикации в Telegram ↗</a>
        )}
      </div>
    </>
  );
}
