"use client";

// «Сегодня новости «Липецкого котла» прочитали N раз» — сумма за сутки по Москве:
//   Telegram — прирост просмотров постов канала (сборщик на GitHub, обновляется каждые ~10 минут, /data/latest.json);
//   ВКонтакте — прирост просмотров записей сообщества (если подключён ключ VK);
//   сайт — открытия страниц и статей на lk48.ru (/stat/hit.php, по одному на сеанс для каждой страницы).
// Все три числа настоящие; цифра растёт сама, пока страница открыта.

import { useEffect, useRef, useState } from "react";
import { plural } from "./lib/format";

type Reads = { date: string; telegram: number; vk: number | null; updatedAt: number };

const POLL_MS = 60_000;
const mskDate = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const format = (value: number) => new Intl.NumberFormat("ru-RU").format(Math.round(value));

/** Засчитать прочтение сайта: один раз за сеанс на страницу и на каждую открытую статью. */
function hit(key: string) {
  const mark = `lk-read:${mskDate()}:${key}`;
  try {
    if (sessionStorage.getItem(mark)) return Promise.resolve(false);
    sessionStorage.setItem(mark, "1");
  } catch {
    /* приватный режим — считаем без отметки */
  }
  return fetch("/stat/hit.php", { method: "POST", cache: "no-store" }).then((response) => response.ok).catch(() => false);
}

export function ReadsToday({ initial }: { initial: Reads }) {
  const [reads, setReads] = useState<Reads>(initial);
  const [site, setSite] = useState(0);
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  const today = mskDate();
  const telegram = reads.date === today ? reads.telegram : 0;
  const vk = reads.date === today && reads.vk !== null ? reads.vk : 0;
  const total = telegram + vk + site;

  // Данные: Telegram/VK — из /data/latest.json, сайт — из /stat/hit.php.
  useEffect(() => {
    let stopped = false;
    const loadSite = () =>
      fetch("/stat/hit.php", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { date: string; site: number } | null) => {
          if (!stopped && data && data.date === mskDate()) setSite(data.site);
        })
        .catch(() => undefined);
    const loadReads = () =>
      fetch(`/data/latest.json?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { reads?: Reads } | null) => {
          if (!stopped && data?.reads) setReads(data.reads);
        })
        .catch(() => undefined);
    const refresh = () => {
      if (document.visibilityState === "visible") void Promise.all([loadSite(), loadReads()]);
    };
    void hit("page").then(loadSite);
    void loadReads();
    const timer = window.setInterval(refresh, POLL_MS);
    // открытая статья (#post-12345) — ещё одно прочтение
    const onHash = () => {
      const id = window.location.hash.match(/^#post-(\d+)$/)?.[1];
      if (id) {
        void hit(`post-${id}`).then((counted) => {
          if (counted) void loadSite();
        });
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Плавный рост числа.
  useEffect(() => {
    const from = shownRef.current;
    const to = total;
    if (from === to) return;
    if (!from) {
      shownRef.current = to;
      setShown(to);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 1200);
      const value = from + (to - from) * (1 - Math.pow(1 - progress, 3));
      shownRef.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [total]);

  const value = Math.round(shown || total);
  if (!value) return null;

  // Компактно, в правом конце тёмной полосы «Лента»: на широком экране — полная фраза, на узком — короче.
  return (
    <span className="ticker__reads" aria-live="polite" title="С 00:00 по Москве">
      <i aria-hidden="true" />
      <span className="ticker__reads-long">Сегодня новости «Липецкого котла» прочитали</span>
      <span className="ticker__reads-mid">Сегодня прочитали</span>
      <span className="ticker__reads-short">Прочитали</span>
      <b>{format(value)}</b>
      {plural(value, "раз", "раза", "раз")}
    </span>
  );
}
