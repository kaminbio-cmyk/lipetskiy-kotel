"use client";

// Меню рубрик: в строке — только целые рубрики, сколько помещается по ширине экрана,
// остальные — в кнопке «Ещё» с выпадающим списком. Слова никогда не обрезаются краем.

import { useEffect, useRef, useState } from "react";
import { NAV_TO_TAG, emitFilter } from "./lib/format";

type CategoryNavProps = {
  categories: string[];
  counts: Record<string, number>;
};

export function CategoryNav({ categories }: CategoryNavProps) {
  const [active, setActive] = useState("Все");
  const [fit, setFit] = useState<number | null>(null); // null — ещё не измерили (до загрузки скриптов лента прокручивается)
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onChange = (event: Event) => setActive((event as CustomEvent<string>).detail);
    window.addEventListener("lk:filter-changed", onChange);
    return () => window.removeEventListener("lk:filter-changed", onChange);
  }, []);

  // Сколько рубрик помещается целиком.
  useEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;
    let frame = 0;
    const compute = () => {
      const items = [...measure.children] as HTMLElement[];
      const moreWidth = items.pop()?.getBoundingClientRect().width ?? 0;
      const widths = items.map((item) => item.getBoundingClientRect().width);
      const style = getComputedStyle(nav);
      const gap = Number.parseFloat(style.columnGap) || 0;
      const available = nav.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) - 1;
      const total = widths.reduce((sum, width, index) => sum + width + (index ? gap : 0), 0);
      if (total <= available) {
        setFit(widths.length);
        return;
      }
      let used = moreWidth;
      let count = 0;
      for (const width of widths) {
        if (used + width + gap > available) break;
        used += width + gap;
        count += 1;
      }
      setFit(Math.max(1, count));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compute);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(nav);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [categories]);

  // Закрыть список «Ещё» по щелчку мимо и по Esc.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = fit ?? categories.length;
  const hidden = categories.slice(shown);
  const hiddenActive = hidden.some((category) => (NAV_TO_TAG[category] ?? category) === active);

  const link = (category: string, extra = "") => {
    const tag = NAV_TO_TAG[category] ?? category;
    const isActive = active === tag;
    return (
      <a
        className={`category-nav__item${isActive ? " is-active" : ""}${extra}`}
        href="#news"
        key={category}
        aria-current={isActive ? "page" : undefined}
        onClick={() => {
          setActive(tag);
          setOpen(false);
          emitFilter(tag);
        }}
      >
        {category}
      </a>
    );
  };

  return (
    <nav ref={navRef} className={`category-nav shell${fit === null ? "" : " is-fitted"}`} aria-label="Рубрики">
      {categories.slice(0, shown).map((category) => link(category))}
      {hidden.length > 0 && (
        <div className="category-nav__more" ref={moreRef}>
          <button
            type="button"
            className={`category-nav__item category-nav__more-button${hiddenActive ? " is-active" : ""}${open ? " is-open" : ""}`}
            aria-expanded={open}
            aria-haspopup="true"
            onClick={() => setOpen((value) => !value)}
          >
            Ещё
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
          </button>
          {open && (
            <div className="category-nav__menu" role="menu">
              {hidden.map((category) => link(category, " category-nav__menu-item"))}
            </div>
          )}
        </div>
      )}
      {/* Невидимая копия всех рубрик — по ней считаем ширину. */}
      <div className="category-nav__measure" ref={measureRef} aria-hidden="true">
        {categories.map((category) => (
          <span className="category-nav__item" key={category}>{category}</span>
        ))}
        <span className="category-nav__item category-nav__more-button">
          Ещё
          <svg viewBox="0 0 12 12"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
        </span>
      </div>
    </nav>
  );
}
