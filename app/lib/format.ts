/** «4.3K» → «4,3 тыс.», «1.2M» → «1,2 млн», «920» → «920». */
export function formatCount(value: string) {
  const match = value.trim().match(/^([\d.,]+)\s*([KM])?$/i);
  if (!match) return value;
  const number = match[1].replace(".", ",");
  const unit = match[2]?.toUpperCase();
  return unit === "K" ? `${number} тыс.` : unit === "M" ? `${number} млн` : number;
}

export function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

/** Ярлыки меню → теги ленты. */
export const NAV_TO_TAG: Record<string, string> = {
  "Все новости": "Все",
};

// По указанию редакции: вместо «Политики» — «Общество», вместо «Транспорта» — «Спорт».
export const NAV_CATEGORIES = [
  "Все новости",
  "Липецк",
  "Регион",
  "Экономика",
  "Власть",
  "Общество",
  "Суд и право",
  "ЖКХ",
  "Происшествия",
  "Аналитика",
  "Нам пишут",
  "Россия и мир",
  "Здоровье",
  "Образование",
  "Спорт",
];

/** Замены рубрик в фильтрах ленты и рубрики, которые показываются всегда. */
const FILTER_SWAP: Record<string, string> = { "Политика": "Общество", "Транспорт": "Спорт" };
const FILTER_ALWAYS = ["Общество", "Спорт"];

/** Фильтры ленты: самые частые темы, «Политика» → «Общество», «Транспорт» → «Спорт», «Общество» и «Спорт» есть всегда. */
export function feedFilters(popular: string[]) {
  const list: string[] = [];
  for (const tag of popular) {
    const name = FILTER_SWAP[tag] ?? tag;
    if (!list.includes(name)) list.push(name);
  }
  for (const tag of FILTER_ALWAYS) if (!list.includes(tag)) list.push(tag);
  return list;
}

export function emitFilter(tag: string) {
  window.dispatchEvent(new CustomEvent("lk:filter", { detail: tag }));
}
