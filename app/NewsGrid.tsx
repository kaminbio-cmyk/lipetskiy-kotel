"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NewsPost } from "./lib/telegram";
import { formatCount, plural } from "./lib/format";
import { EyeIcon, TelegramIcon } from "./icons";
import { Highlight } from "./SiteSearch";

const PAGE_SIZE = 12;
const POLL_MS = 90_000;
const TELEGRAM_CHANNEL = "https://t.me/lippot";

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Слишком длинная первая строка поста: в заголовок — до последней запятой или скобки, целиком — подводкой. */
function splitHeading(full: string): { title: string; lead: string | null } {
  if (full.length <= 160) return { title: full, lead: null };
  const head = full.slice(0, 150);
  const cut = Math.max(head.lastIndexOf(", "), head.lastIndexOf(" ("), head.lastIndexOf(". "), head.lastIndexOf(": "));
  const title = cut >= 50 ? head.slice(0, cut).trim() : head.replace(/\s+\S*$/, "");
  // Подводка продолжает заголовок, без повтора уже показанного.
  const rest = full.slice(title.length).replace(/^[\s,.:]+/, "");
  return { title: rest ? `${title}…` : title, lead: rest ? `…${rest}` : null };
}

function MediaBox({ post, eager = false }: { post: NewsPost; eager?: boolean }) {
  const src = post.images[0]?.src ?? post.video?.thumb ?? post.cover;
  if (!src) return null;
  return (
    <span className="media-box">
      <img className="media-box__blur" src={src} alt="" aria-hidden="true" loading={eager ? "eager" : "lazy"} />
      <img className="media-box__img" src={src} alt={post.title} loading={eager ? "eager" : "lazy"} />
      {post.video && (
        <span className="media-badge media-badge--play">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
          {post.video.duration || "Видео"}
        </span>
      )}
      {post.images.length > 1 && (
        <span className="media-badge">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="14" height="12" rx="2.5" /><path d="M7 3.5h11.5A2.5 2.5 0 0 1 21 6v10" /></svg>
          {post.images.length}
        </span>
      )}
    </span>
  );
}

function Reactions({ post, limit = 4 }: { post: NewsPost; limit?: number }) {
  if (!post.reactions.length) return null;
  return (
    <span className="reactions" aria-label="Реакции читателей">
      {post.reactions.slice(0, limit).map((reaction) => (
        <span key={reaction.emoji}>
          {reaction.emoji}
          <b>{reaction.count}</b>
        </span>
      ))}
    </span>
  );
}

function Gallery({ post }: { post: NewsPost }) {
  const [index, setIndex] = useState(0);
  const total = post.images.length;

  if (post.video) {
    return (
      <div className="reader__media reader__media--video">
        {post.video.src ? (
          <video
            controls
            playsInline
            preload="none"
            poster={post.video.thumb}
            src={post.video.src}
            style={post.video.ratio ? { aspectRatio: `${1 / post.video.ratio}` } : undefined}
          />
        ) : (
          <a href={post.url} target="_blank" rel="noreferrer" className="reader__video-link">
            <img src={post.video.thumb} alt={post.title} />
            <span className="reader__play" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg>
            </span>
          </a>
        )}
        {post.images.length > 0 && <GalleryStrip images={post.images} active={-1} onPick={() => undefined} />}
      </div>
    );
  }

  if (!total) {
    return post.cover ? (
      <div className="reader__media reader__media--cover">
        <img src={post.cover} alt={post.title} />
      </div>
    ) : null;
  }

  const image = post.images[Math.min(index, total - 1)];
  return (
    <div className="reader__media">
      <div className="reader__stage">
        <img className="media-box__blur" src={image.src} alt="" aria-hidden="true" />
        <img
          className="reader__image"
          src={image.src}
          alt={total > 1 ? `${post.title} — фото ${index + 1} из ${total}` : post.title}
          style={image.ratio ? { aspectRatio: `${1 / image.ratio}` } : undefined}
        />
        {total > 1 && (
          <>
            <button type="button" className="reader__arrow reader__arrow--prev" onClick={() => setIndex((index - 1 + total) % total)} aria-label="Предыдущее фото">‹</button>
            <button type="button" className="reader__arrow reader__arrow--next" onClick={() => setIndex((index + 1) % total)} aria-label="Следующее фото">›</button>
            <span className="reader__counter">{index + 1} / {total}</span>
          </>
        )}
      </div>
      {total > 1 && <GalleryStrip images={post.images} active={index} onPick={setIndex} />}
    </div>
  );
}

function GalleryStrip({ images, active, onPick }: { images: NewsPost["images"]; active: number; onPick: (index: number) => void }) {
  return (
    <div className="reader__thumbs">
      {images.map((image, index) => (
        <button key={image.src} type="button" className={index === active ? "is-active" : ""} onClick={() => onPick(index)} aria-label={`Фото ${index + 1}`}>
          <img src={image.src} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function Reader({
  post,
  neighbours,
  onClose,
  onOpen,
  onTag,
  canOpen,
  highlight,
}: {
  post: NewsPost;
  neighbours: { prev: NewsPost | null; next: NewsPost | null };
  onClose: () => void;
  onOpen: (id: string) => void;
  onTag: (tag: string) => void;
  canOpen: (id: string) => boolean;
  highlight: string;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [notice, setNotice] = useState("");
  const [found, setFound] = useState(0);

  // Подсветка искомых слов в тексте статьи и прокрутка к первому совпадению.
  useEffect(() => {
    const root = textRef.current;
    setFound(0);
    if (!root || !highlight) return;
    const list = highlight.toLowerCase().split(/\s+/).filter((word) => word.length > 1).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!list.length) return;
    const pattern = new RegExp(`(${list.join("|")})`, "gi");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    let count = 0;
    for (const node of nodes) {
      const value = node.nodeValue ?? "";
      pattern.lastIndex = 0;
      if (!pattern.test(value)) continue;
      const fragment = document.createDocumentFragment();
      value.split(pattern).forEach((part, index) => {
        if (index % 2 === 1) {
          const mark = document.createElement("mark");
          mark.textContent = part;
          fragment.appendChild(mark);
          count += 1;
        } else if (part) fragment.appendChild(document.createTextNode(part));
      });
      node.replaceWith(fragment);
    }
    setFound(count);
    const first = root.querySelector("mark");
    if (first && sheetRef.current) {
      window.setTimeout(() => first.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    }
  }, [highlight, post.id]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && neighbours.next && !(event.target instanceof HTMLInputElement)) onOpen(neighbours.next.id);
      if (event.key === "ArrowLeft" && neighbours.prev && !(event.target instanceof HTMLInputElement)) onOpen(neighbours.prev.id);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [neighbours, onClose, onOpen]);

  useEffect(() => {
    sheetRef.current?.scrollTo({ top: 0 });
  }, [post.id]);

  const heading = splitHeading(post.fullTitle || post.title);
  const pageUrl = typeof window === "undefined" ? post.url : `${window.location.origin}${window.location.pathname}#post-${post.id}`;

  async function share() {
    const data = { title: post.title, text: post.title, url: pageUrl };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(`${post.title}\n${pageUrl}`);
      setNotice("Ссылка скопирована");
    } catch {
      setNotice("");
    }
    window.setTimeout(() => setNotice(""), 2200);
  }

  function onTextClick(event: React.MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    const hashtag = link.getAttribute("data-hashtag");
    if (hashtag) {
      event.preventDefault();
      onTag(hashtag);
      return;
    }
    const target = link.getAttribute("data-post");
    if (target && canOpen(target)) {
      event.preventDefault();
      onOpen(target);
    }
  }

  return (
    <div className="reader" role="dialog" aria-modal="true" aria-labelledby="reader-title">
      <button type="button" className="reader__backdrop" onClick={onClose} aria-label="Закрыть статью" tabIndex={-1} />
      <div className="reader__sheet" ref={sheetRef}>
        <div className="reader__bar">
          <span className="chip">{post.category}</span>
          <time dateTime={post.dateIso}>{post.date}</time>
          <button type="button" ref={closeRef} className="reader__close" onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <article className="reader__article" data-post-id={post.id}>
          <h1 id="reader-title">{heading.title}</h1>
          {heading.lead && <p className="reader__lead">{heading.lead}</p>}
          <div className="reader__meta">
            {post.views && <span>{formatCount(post.views)} просмотров</span>}
            <span>{post.readMinutes} мин чтения</span>
            {post.parts.length > 0 && <span>{post.parts.length + 1} {plural(post.parts.length + 1, "часть", "части", "частей")}</span>}
            {post.forwardedFrom && <span>Источник: {post.forwardedFrom}</span>}
          </div>

          <Gallery key={post.id} post={post} />

          {found > 0 && (
            <div className="reader__found">
              <mark>{highlight}</mark> — найдено в тексте: {found}
            </div>
          )}
          <div key={`${post.id}|${highlight}`} ref={textRef} className="reader__text" onClick={onTextClick} dangerouslySetInnerHTML={{ __html: post.html }} />

          {post.reactions.length > 0 && (
            <div className="reader__reactions">
              <span>Реакции читателей</span>
              <Reactions post={post} limit={8} />
            </div>
          )}

          <div className="reader__tags" aria-label="Теги новости">
            {post.tags.map((tag) => (
              <button key={tag} type="button" onClick={() => onTag(tag)}>#{tag}</button>
            ))}
          </div>

          <div className="reader__actions">
            <a className="button button--primary" href={post.url} target="_blank" rel="noreferrer">
              <TelegramIcon /> Обсудить в Telegram
            </a>
            <button className="button button--light" type="button" onClick={share}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" /></svg>
              {notice || "Поделиться"}
            </button>
            <a className="button button--ghost" href={`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noreferrer">Telegram</a>
            <a className="button button--ghost" href={`https://vk.com/share.php?url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(post.title)}`} target="_blank" rel="noreferrer">ВКонтакте</a>
          </div>

          <nav className="reader__nav" aria-label="Соседние новости">
            {neighbours.prev ? (
              <button type="button" onClick={() => onOpen(neighbours.prev!.id)}>
                <small>← Новее</small>
                <strong>{neighbours.prev.title}</strong>
              </button>
            ) : <span />}
            {neighbours.next ? (
              <button type="button" onClick={() => onOpen(neighbours.next!.id)}>
                <small>Следующая →</small>
                <strong>{neighbours.next.title}</strong>
              </button>
            ) : <span />}
          </nav>
        </article>
      </div>
    </div>
  );
}

function NewsCard({ post, query, onOpen }: { post: NewsPost; query: string; onOpen: (id: string) => void }) {
  return (
    <article className="news-card" data-post-id={post.id}>
      <a
        className="news-card__link"
        href={`#post-${post.id}`}
        onClick={(event) => {
          event.preventDefault();
          onOpen(post.id);
        }}
      >
        <MediaBox post={post} />
        <span className="news-card__body">
          <span className="news-card__meta">
            <b className="chip">{post.category}</b>
            <time dateTime={post.dateIso}>{post.dateShort}</time>
          </span>
          <strong className="news-card__title"><Highlight text={post.title} query={query} /></strong>
          {post.excerpt && <span className="news-card__excerpt"><Highlight text={post.excerpt} query={query} /></span>}
          <span className="news-card__footer">
            {post.views && (
              <span className="stat">
                <EyeIcon />
                {formatCount(post.views)}
              </span>
            )}
            <span className="stat">{post.readMinutes} мин</span>
            <Reactions post={post} limit={3} />
            <span className="news-card__more">Читать →</span>
          </span>
        </span>
      </a>
    </article>
  );
}

export function NewsGrid({ posts: initialPosts }: { posts: NewsPost[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [pending, setPending] = useState<NewsPost[]>([]);
  const [active, setActive] = useState("Все");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [extras, setExtras] = useState<NewsPost[]>([]);
  const [highlight, setHighlight] = useState("");
  const [archive, setArchive] = useState<NewsPost[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  const searchIndex = useMemo(
    () => new Map(posts.map((post) => [post.id, `${post.title} ${post.excerpt} ${stripHtml(post.html)} ${post.tags.join(" ")}`.toLowerCase()])),
    [posts]
  );

  const filters = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((post) => post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    const popular = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
      .slice(0, 11)
      .map(([tag]) => tag);
    if (active !== "Все" && !popular.includes(active)) popular.push(active);
    return ["Все", ...popular];
  }, [posts, active]);

  const filteredPosts = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return posts.filter((post) => {
      if (active !== "Все" && !post.tags.includes(active)) return false;
      if (!words.length) return true;
      const text = searchIndex.get(post.id) ?? "";
      return words.every((word) => text.includes(word));
    });
  }, [active, posts, query, searchIndex]);

  const visiblePosts = filteredPosts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPosts.length;

  const chooseFilter = useCallback((filter: string) => {
    setActive(filter);
    setQuery("");
    setVisibleCount(PAGE_SIZE);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("lk:filter-changed", { detail: active }));
  }, [active]);

  useEffect(() => {
    const onFilter = (event: Event) => {
      chooseFilter((event as CustomEvent<string>).detail);
      setOpenId(null);
    };
    // Строка поиска в шапке: «Показать все результаты» и открытие найденной статьи.
    const onQuery = (event: Event) => {
      setActive("Все");
      setQuery((event as CustomEvent<string>).detail);
      setVisibleCount(PAGE_SIZE);
      setOpenId(null);
    };
    const onHighlight = (event: Event) => setHighlight((event as CustomEvent<string>).detail);
    const onOpenPost = (event: Event) => {
      const { post, highlight: words } = (event as CustomEvent<{ post: NewsPost; highlight: string }>).detail;
      setExtras((current) => (current.some((item) => item.id === post.id) ? current : [...current, post]));
      setHighlight(words);
      window.setTimeout(() => {
        window.location.hash = `post-${post.id}`;
        setOpenId(post.id);
      }, 0);
    };
    window.addEventListener("lk:filter", onFilter);
    window.addEventListener("lk:query", onQuery);
    window.addEventListener("lk:highlight", onHighlight);
    window.addEventListener("lk:open-post", onOpenPost);
    return () => {
      window.removeEventListener("lk:filter", onFilter);
      window.removeEventListener("lk:query", onQuery);
      window.removeEventListener("lk:highlight", onHighlight);
      window.removeEventListener("lk:open-post", onOpenPost);
    };
  }, [chooseFilter]);

  // Ответ строке поиска в шапке: совпадения по полному тексту статей месяца.
  useEffect(() => {
    const onLocalSearch = (event: Event) => {
      const { q, reply } = (event as CustomEvent<{ q: string; reply: (found: Array<{ id: string; title: string; category: string; date: string; text: string }>) => void }>).detail;
      const list = q.toLowerCase().split(/\s+/).filter((word) => word.length > 1);
      const found = posts
        .filter((post) => list.every((word) => (searchIndex.get(post.id) ?? "").includes(word)))
        .slice(0, 5)
        .map((post) => ({ id: post.id, title: post.title, category: post.category, date: post.dateShort, text: "" }));
      reply(found);
    };
    window.addEventListener("lk:local-search", onLocalSearch);
    return () => window.removeEventListener("lk:local-search", onLocalSearch);
  }, [posts, searchIndex]);

  const findPost = useCallback(
    (id: string) => posts.find((post) => post.id === id) ?? extras.find((post) => post.id === id) ?? archive.find((post) => post.id === id) ?? null,
    [posts, extras, archive]
  );

  // Открытие статьи по адресу #post-12345 (ссылки с главной, из подборок, присланные друзьям).
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.match(/^#post-(\d+)$/)?.[1] ?? null;
      setOpenId(id && findPost(id) ? id : null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [findPost]);

  // Поиск по всему архиву канала — когда в ленте задан запрос.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setArchive([]);
      setArchiveLoading(false);
      return;
    }
    setArchiveLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await response.json()) as { posts: NewsPost[] };
        setArchive(data.posts ?? []);
      } catch {
        /* отменено или нет сети */
      } finally {
        if (!controller.signal.aborted) setArchiveLoading(false);
      }
    }, 500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const archiveOnly = useMemo(() => {
    const known = new Set(posts.map((post) => post.id));
    return archive.filter((post) => !known.has(post.id));
  }, [archive, posts]);

  const openPost = useCallback(
    (id: string) => {
      if (query.trim()) setHighlight(query.trim());
      if (window.location.hash !== `#post-${id}`) window.location.hash = `post-${id}`;
      setOpenId(id);
    },
    [query]
  );

  const closePost = useCallback(() => {
    setOpenId(null);
    setHighlight("");
    if (window.location.hash.startsWith("#post-")) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredPosts.length));
      },
      { rootMargin: "800px 0px", threshold: 0.01 }
    );
    observer.observe(loader);
    return () => observer.disconnect();
  }, [filteredPosts.length, hasMore]);

  // Живое обновление: раз в полторы минуты спрашиваем сайт о новых постах канала.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const known = [...posts, ...pending];
      const since = Math.max(0, ...known.map((post) => Number(post.id)));
      try {
        const response = await fetch(`/api/feed?since=${since}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { posts: NewsPost[] };
        if (!stopped && data.posts?.length) {
          setPending((current) => {
            const ids = new Set([...current, ...posts].map((post) => post.id));
            return [...data.posts.filter((post) => !ids.has(post.id)), ...current];
          });
        }
      } catch {
        /* сеть пропала — попробуем позже */
      }
    };
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [posts, pending]);

  function showPending() {
    setPosts((current) => [...pending, ...current].sort((a, b) => Number(b.id) - Number(a.id)));
    setPending([]);
    chooseFilter("Все");
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const openPostData = openId ? findPost(openId) : null;
  // Соседние статьи — из того списка, где открыта статья: лента месяца или найденное в архиве.
  const list = openId && posts.some((post) => post.id === openId) ? posts : archiveOnly;
  const openIndex = openId ? list.findIndex((post) => post.id === openId) : -1;
  const neighbours = {
    prev: openIndex > 0 ? list[openIndex - 1] : null,
    next: openIndex >= 0 && openIndex < list.length - 1 ? list[openIndex + 1] : null,
  };
  const searching = query.trim().length >= 2;

  return (
    <div ref={sectionRef} className="news-feed">
      <div className="archive-toolbar">
        <label className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Поиск по новостям и архиву канала…"
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            aria-label="Поиск по новостям"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск">×</button>
          )}
        </label>
        <div className="filters" role="group" aria-label="Фильтр новостей по темам">
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
          {filteredPosts.length} {plural(filteredPosts.length, "публикация", "публикации", "публикаций")}
        </span>
      </div>

      {searching && (
        <div className="search-summary" role="status">
          По запросу <mark>«{query.trim()}»</mark>: за месяц — {filteredPosts.length}
          {archiveLoading ? ", ищем в архиве канала…" : `, в архиве канала — ещё ${archiveOnly.length}`}
          <button type="button" onClick={() => setQuery("")}>Сбросить</button>
        </div>
      )}

      <div className="news-grid">
        {visiblePosts.map((post) => (
          <NewsCard key={post.id} post={post} query={query} onOpen={openPost} />
        ))}
      </div>

      {visiblePosts.length === 0 && (
        <div className="empty-state">
          {searching
            ? "За последние 30 дней совпадений нет — смотрите найденное в архиве канала ниже."
            : <>Ничего не нашлось. Попробуйте другое слово или <button type="button" onClick={() => chooseFilter("Все")}>покажите все новости</button>.</>}
        </div>
      )}

      {searching && (archiveLoading || archiveOnly.length > 0) && (
        <section className="archive-results" aria-label="Найдено в архиве канала">
          <div className="archive-results__head">
            <span className="section-kicker">Поиск по всему каналу @lippot</span>
            <h3>Найдено в архиве {archiveLoading && <i className="site-search__spinner" aria-label="Ищем" />}</h3>
          </div>
          <div className="news-grid">
            {archiveOnly.map((post) => (
              <NewsCard
                key={post.id}
                post={post}
                query={query}
                onOpen={(id) => {
                  setHighlight(query.trim());
                  window.location.hash = `post-${id}`;
                  setOpenId(id);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {hasMore ? (
        <div className="more-news" ref={loaderRef} role="status" aria-live="polite">
          <span className="more-news__spinner" aria-hidden="true" />
          <span>Загружаем следующие новости…</span>
        </div>
      ) : filteredPosts.length > 0 ? (
        <div className="feed-complete">
          <span>Вы дочитали ленту за 30 дней</span>
          <a href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">Архив канала в Telegram ↗</a>
        </div>
      ) : null}

      {pending.length > 0 && (
        <button type="button" className="fresh-pill" onClick={showPending}>
          <span className="fresh-pill__dot" aria-hidden="true" />
          {pending.length} {plural(pending.length, "новая публикация", "новые публикации", "новых публикаций")} — показать
        </button>
      )}

      {openPostData && (
        <Reader
          post={openPostData}
          neighbours={neighbours}
          onClose={closePost}
          onOpen={openPost}
          highlight={highlight}
          canOpen={(id) => Boolean(findPost(id))}
          onTag={(tag) => {
            closePost();
            chooseFilter(tag);
            window.setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
          }}
        />
      )}
    </div>
  );
}
