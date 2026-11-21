"use client";

import { emitFilter } from "./lib/format";

export function TopicChips({ topics }: { topics: Array<{ tag: string; count: number }> }) {
  return (
    <div className="topics__chips">
      {topics.map((topic) => (
        <a key={topic.tag} href="#news" onClick={() => emitFilter(topic.tag)}>
          <span>#{topic.tag}</span>
          <b>{topic.count}</b>
        </a>
      ))}
    </div>
  );
}

export function FilterLink({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <a href="#news" onClick={() => emitFilter(tag)}>
      {children}
    </a>
  );
}

export function SearchButton() {
  return (
    <a
      className="icon-button"
      href="#news"
      aria-label="Поиск по новостям"
      onClick={() => window.setTimeout(() => window.dispatchEvent(new Event("lk:search")), 350)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
    </a>
  );
}
