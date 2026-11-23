"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NewsPost } from "./lib/telegram";

export type SearchItem = { id: string; title: string; category: string; date: string; text: string };

const SUGGESTIONS = ["бюджет", "тарифы ЖКХ", "НЛМК", "суд", "Елец", "выборы"];

function words(query: string) {
  return query.toLowerCase().split(/\s+/).filter((word) => word.length > 1);
}

/** Подсветка найденных слов в строке. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const list = words(query).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!list.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${list.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : part))}
    </>
  );
}

/** Строка поиска в шапке: мгновенно — по новостям месяца, с задержкой — по всему архиву канала. */
export function SiteSearch({ items }: { items: SearchItem[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [archive, setArchive] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [local, setLocal] = useState<SearchItem[]>([]);

  // Новости месяца ищет лента (у неё полный текст статей); если ленты нет — по заголовкам и анонсам.
  useEffect(() => {
    const list = words(query);
    if (!list.length) {
      setLocal([]);
      return;
    }
    let replied = false;
    window.dispatchEvent(
      new CustomEvent("lk:local-search", {
        detail: {
          q: query,
          reply: (found: SearchItem[]) => {
            replied = true;
            setLocal(found.slice(0, 5));
          },
        },
      })
    );
    if (!replied) setLocal(items.filter((item) => list.every((word) => item.text.includes(word))).slice(0, 5));
  }, [items, query]);

  const archiveOnly = useMemo(() => {
    const known = new Set(items.map((item) => item.id));
    return archive.filter((post) => !known.has(post.id)).slice(0, 6);
  }, [archive, items]);

  // Поиск по архиву канала — после паузы в наборе.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setArchive([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await response.json()) as { posts: NewsPost[] };
        setArchive(data.posts ?? []);
      } catch {
        /* отменено или нет сети */
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  // Закрытие по клику мимо, «/» — к поиску.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/input|textarea/i.test(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onFocusSearch = () => {
      inputRef.current?.focus();
      setOpen(true);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lk:search", onFocusSearch);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("lk:search", onFocusSearch);
    };
  }, []);

  const options = [
    ...local.map((item) => ({ kind: "local" as const, id: item.id })),
    ...archiveOnly.map((post) => ({ kind: "archive" as const, id: post.id })),
  ];

  function openLocal(id: string) {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("lk:highlight", { detail: query.trim() }));
    window.location.hash = `post-${id}`;
  }

  function openArchive(post: NewsPost) {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("lk:open-post", { detail: { post, highlight: query.trim() } }));
  }

  function showAll(value = query) {
    const q = value.trim();
    if (!q) return;
    setOpen(false);
    inputRef.current?.blur();
    window.dispatchEvent(new CustomEvent("lk:query", { detail: q }));
    document.getElementById("news")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setCursor((current) => Math.max(-1, Math.min(options.length - 1, current + step)));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = options[cursor];
      if (chosen?.kind === "local") openLocal(chosen.id);
      else if (chosen?.kind === "archive") {
        const post = archiveOnly.find((item) => item.id === chosen.id);
        if (post) openArchive(post);
      } else showAll();
    }
  }

  const showPanel = open && (query.trim().length >= 2 || query.length === 0);

  return (
    <div className="site-search" ref={boxRef} role="search">
      <label className="site-search__field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Поиск по новостям и архиву канала"
          aria-label="Поиск по новостям и архиву канала"
          aria-expanded={showPanel}
          aria-controls="site-search-panel"
          autoComplete="off"
          enterKeyHint="search"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(-1);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button type="button" className="site-search__clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Очистить поиск">×</button>
        ) : (
          <kbd aria-hidden="true">/</kbd>
        )}
      </label>

      {showPanel && (
        <div className="site-search__panel" id="site-search-panel">
          {query.length === 0 ? (
            <div className="site-search__hints">
              <span>Часто ищут</span>
              <div>
                {SUGGESTIONS.map((word) => (
                  <button key={word} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(word); setOpen(true); }}>
                    {word}
                  </button>
                ))}
              </div>
              <small>Ищем по новостям за месяц и по всему архиву канала @lippot</small>
            </div>
          ) : (
            <>
              <div className="site-search__group">
                <span className="site-search__label">Новости за месяц</span>
                {local.length ? (
                  local.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cursor === index ? "is-active" : ""}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openLocal(item.id)}
                    >
                      <strong><Highlight text={item.title} query={query} /></strong>
                      <small>{item.category} · {item.date}</small>
                    </button>
                  ))
                ) : (
                  <p className="site-search__empty">За последние 30 дней совпадений нет</p>
                )}
              </div>
              <div className="site-search__group">
                <span className="site-search__label">
                  Архив канала
                  {loading && <i className="site-search__spinner" aria-label="Ищем" />}
                </span>
                {archiveOnly.map((post, index) => (
                  <button
                    key={post.id}
                    type="button"
                    className={cursor === local.length + index ? "is-active" : ""}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => openArchive(post)}
                  >
                    <strong><Highlight text={post.title} query={query} /></strong>
                    <small>{post.category} · {post.dateShort}</small>
                  </button>
                ))}
                {!loading && archiveOnly.length === 0 && <p className="site-search__empty">Старых публикаций не найдено</p>}
              </div>
              <button type="button" className="site-search__all" onMouseDown={(event) => event.preventDefault()} onClick={() => showAll()}>
                Показать все результаты в ленте ↓
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
