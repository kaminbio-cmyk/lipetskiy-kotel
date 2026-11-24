"use client";

// Низ левой колонки первого экрана: «Читают сейчас» и «Обсуждают».
// Колонка тянется до низа главных новостей справа, а здесь показываем столько целых строк,
// сколько помещается по высоте (поровну из обеих подборок), — без пустоты и без обрезанных заголовков.

import { useEffect, useRef } from "react";
import type { BriefItem } from "./BriefTabs";

type Section = { key: string; label: string; items: BriefItem[] };

export function BriefFill({ sections }: { sections: Section[] }) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let frame = 0;

    const fit = () => {
      const groups = [...box.querySelectorAll<HTMLElement>("[data-fill-section]")];
      // Мерим всё в полном виде.
      groups.forEach((group) => {
        group.hidden = false;
        group.querySelectorAll("li").forEach((li) => (li.hidden = false));
      });
      const available = box.clientHeight;
      if (available < 40) {
        groups.forEach((group) => (group.hidden = true));
        return;
      }
      const rows = groups.map((group) => [...group.querySelectorAll<HTMLElement>("li")].map((li) => li.offsetHeight));
      const base = groups.map((group, index) => group.offsetHeight - rows[index].reduce((sum, height) => sum + height, 0));
      const counts = groups.map(() => 0);
      let used = 0;
      let added = true;
      // По одной строке из каждой подборки по очереди, пока помещается.
      while (added) {
        added = false;
        groups.forEach((_, index) => {
          const next = rows[index][counts[index]];
          if (next === undefined) return;
          const cost = next + (counts[index] === 0 ? base[index] : 0);
          if (used + cost <= available) {
            used += cost;
            counts[index] += 1;
            added = true;
          }
        });
      }
      groups.forEach((group, index) => {
        group.hidden = counts[index] === 0;
        group.querySelectorAll("li").forEach((li, row) => (li.hidden = row >= counts[index]));
      });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(box);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [sections]);

  return (
    <div className="brief-fill">
      <div className="brief-fill__inner" ref={boxRef}>
        {sections.map((section) =>
          section.items.length ? (
            <section key={section.key} className={`brief-fill__group brief-fill__group--${section.key}`} data-fill-section>
              <h3 className="brief-fill__head">{section.label}</h3>
              <ol className="brief-list brief-list--fill">
                {section.items.map((item, index) => (
                  <li key={item.id}>
                    <a href={`#post-${item.id}`}>
                      <span className="brief-list__rank">{index + 1}</span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.category}
                          {item.meta ? <> · {item.meta}</> : null}
                        </small>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null
        )}
      </div>
    </div>
  );
}
