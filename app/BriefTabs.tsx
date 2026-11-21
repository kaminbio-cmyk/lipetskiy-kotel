"use client";

import { useState } from "react";

export type BriefItem = { id: string; title: string; category: string; meta: string };

type BriefTabsProps = {
  tabs: Array<{ key: string; label: string; items: BriefItem[] }>;
};

export function BriefTabs({ tabs }: BriefTabsProps) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];

  return (
    <>
      <div className="brief-tabs" role="tablist" aria-label="Подборки новостей">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === active}
            className={tab.key === active ? "is-active" : ""}
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ol className={`brief-list brief-list--${current?.key ?? ""}`} role="tabpanel">
        {current?.items.map((item, index) => (
          <li key={item.id}>
            <a href={`#post-${item.id}`}>
              {current.key !== "fresh" && <span className="brief-list__rank">{index + 1}</span>}
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
    </>
  );
}
