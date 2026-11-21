"use client";

import { useState } from "react";

type CategoryNavProps = {
  categories: string[];
};

export function CategoryNav({ categories }: CategoryNavProps) {
  const [activeCategory, setActiveCategory] = useState(categories[0] ?? "");

  return (
    <nav className="category-nav shell" aria-label="Рубрики">
      {categories.map((category) => (
        <a
          className={activeCategory === category ? "is-active" : ""}
          href="#news"
          key={category}
          aria-current={activeCategory === category ? "page" : undefined}
          onClick={() => setActiveCategory(category)}
        >
          {category}
        </a>
      ))}
    </nav>
  );
}
