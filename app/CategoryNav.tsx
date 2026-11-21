"use client";

import { useEffect, useState } from "react";
import { NAV_TO_TAG, emitFilter } from "./lib/format";

type CategoryNavProps = {
  categories: string[];
  counts: Record<string, number>;
};

export function CategoryNav({ categories, counts }: CategoryNavProps) {
  const [active, setActive] = useState("Все");

  useEffect(() => {
    const onChange = (event: Event) => setActive((event as CustomEvent<string>).detail);
    window.addEventListener("lk:filter-changed", onChange);
    return () => window.removeEventListener("lk:filter-changed", onChange);
  }, []);

  return (
    <nav className="category-nav shell" aria-label="Рубрики">
      {categories
        .filter((category) => category === "Все новости" || (counts[NAV_TO_TAG[category] ?? category] ?? 0) > 0)
        .map((category) => {
          const tag = NAV_TO_TAG[category] ?? category;
          const isActive = active === tag;
          return (
            <a
              className={isActive ? "is-active" : ""}
              href="#news"
              key={category}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                setActive(tag);
                emitFilter(tag);
              }}
            >
              {category}
            </a>
          );
        })}
    </nav>
  );
}
