// Лента канала @lippot: загрузка публичной веб-версии t.me/s/lippot, разбор, склейка продолжений, рубрики, кеш.

import staticFeedJson from "./static-feed.json";

export const TELEGRAM_CHANNEL = "https://t.me/lippot";
export const TELEGRAM_FEED = "https://t.me/s/lippot";
export const VK_CHANNEL = "https://vk.ru/lipboiler2";
export const EDITOR_EMAIL = "lipport@protonmail.com";

const ARCHIVE_DAYS = 30;
const PAGE_STEP = 16; // на странице t.me/s не меньше 16 сообщений, значит шаг в 16 номеров не даёт пропусков
const PARALLEL = 4;
const MAX_REQUESTS = 40;
const CACHE_TTL_MS = 4 * 60 * 1000;
const CACHE_KEY = "https://feed-cache.lipetskiy-kotel.local/lippot-v4";

export type Reaction = { emoji: string; count: string };
export type Media = { src: string; ratio: number | null };
export type Video = { thumb: string; duration: string; src: string | null; ratio: number | null };

export type NewsPost = {
  id: string;
  title: string;
  fullTitle: string;
  excerpt: string;
  html: string;
  category: string;
  tags: string[];
  date: string;
  dateShort: string;
  dateIso: string;
  views: string;
  viewsCount: number;
  url: string;
  images: Media[];
  video: Video | null;
  cover: string | null;
  reactions: Reaction[];
  reactionsCount: number;
  forwardedFrom: string | null;
  readMinutes: number;
  parts: string[];
};

export type ChannelInfo = {
  title: string;
  description: string;
  subscribers: string;
  photos: string;
  videos: string;
};

export type Feed = {
  posts: NewsPost[];
  channel: ChannelInfo;
  live: boolean;
  completeMonth: boolean;
  fetchedAt: number;
  /** Статичная копия для хостинга без доступа к Telegram: адрес сайта, данные готовит сборщик на GitHub. */
  static?: { origin: string };
};

/* ---------- статичная копия ---------- */

/** В обычной сборке файл пустой (null). Сборщик для хостинга кладёт в него готовую ленту с локальными фото и видео. */
export const STATIC_FEED = staticFeedJson as unknown as Feed | null;

/* ---------- медиа через сам сайт ---------- */

// Серверы картинок Telegram в России часто отвечают с большой задержкой.
// Поэтому фото и видео отдаются с адреса сайта: /api/img скачивает их сам и кеширует.
export const MEDIA_HOSTS = /^cdn\d*\.(?:telesco\.pe|telegram-cdn\.org)$/i;

function viaSite(url: string) {
  try {
    const parsed = new URL(url, "https://t.me");
    if (parsed.protocol !== "https:" || !MEDIA_HOSTS.test(parsed.hostname)) return url;
    return `/api/img?u=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return url;
  }
}

/* ---------- текст ---------- */

const ENTITIES: Record<string, string> = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
  mdash: "—", ndash: "–", laquo: "«", raquo: "»", hellip: "…",
};

export function decodeHtml(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#")) {
      const hex = code[1]?.toLowerCase() === "x";
      const number = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function plainText(html: string) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|blockquote|div|pre)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Оставляет только безопасную разметку Telegram: жирный, курсив, ссылки, цитаты, код. */
function sanitizeHtml(html: string) {
  const withEmoji = html
    .replace(/<i class="emoji"[^>]*>\s*<b>([\s\S]*?)<\/b>\s*<\/i>/g, "$1")
    .replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, "$1")
    .replace(/<span class="tg-spoiler"[^>]*>/g, "<span>");
  const allowed = new Set(["b", "strong", "i", "em", "u", "s", "del", "code", "pre", "blockquote", "a", "br"]);
  return withEmoji.replace(/<(\/?)([a-z0-9-]+)([^>]*)>/gi, (_, close: string, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return "";
    if (tag === "br") return "<br>";
    if (close) return `</${tag}>`;
    if (tag === "a") {
      const href = attrs.match(/href="([^"]*)"/i)?.[1] ?? "";
      const decoded = decodeHtml(href);
      if (decoded.startsWith("?q=")) {
        const tagName = decodeURIComponent(decoded.slice(3)).replace(/^#/, "");
        return `<a data-hashtag="${escapeAttr(tagName)}" href="#news">`;
      }
      const internal = decoded.match(/^https?:\/\/t\.me\/lippot\/(\d+)/i);
      if (internal) return `<a data-post="${internal[1]}" href="${escapeAttr(decoded)}" target="_blank" rel="noreferrer">`;
      if (!/^(https?:|tg:|mailto:)/i.test(decoded)) return "<a>";
      return `<a href="${escapeAttr(decoded)}" target="_blank" rel="noreferrer nofollow">`;
    }
    return `<${tag}>`;
  });
}

/** Разбивает html на абзацы по двойным переносам строк; цитаты не разрываем. */
function toParagraphs(html: string) {
  const quotes: string[] = [];
  const protectedHtml = html.replace(/<blockquote>[\s\S]*?<\/blockquote>/g, (quote) => {
    quotes.push(quote.replace(/^<blockquote>(?:\s*<br>)+/, "<blockquote>").replace(/(?:<br>\s*)+<\/blockquote>$/, "</blockquote>"));
    return `<br><br>@@Q${quotes.length - 1}@@<br><br>`;
  });
  return protectedHtml
    .split(/(?:\s*<br>\s*){2,}/)
    .map((part) => part.replace(/^(\s*<br>)+|(<br>\s*)+$/g, "").trim())
    .filter((part) => part.replace(/<[^>]+>/g, "").trim().length > 0)
    .map((part) => {
      const only = part.match(/^@@Q(\d+)@@$/);
      if (only) return quotes[Number(only[1])];
      return `<p>${part.replace(/@@Q(\d+)@@/g, (_, index: string) => quotes[Number(index)])}</p>`;
    })
    .join("");
}

/* ---------- рубрики ---------- */

// Совпадение только с начала слова: «суд» найдёт «суда», «судебный», но не «государство».
const w = (stems: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${stems})`, "giu");

const TOPIC_RULES: Array<[string, RegExp]> = [
  ["Суд и право", w("суд(?!ьб)|судеб|судь[яеи]|прокур|следств|следовател|ск рф|уголовн|коап|приговор|арбитраж|иск(?:а|ом|у|и|ов|ам|ами)?(?![\\p{L}])|истц|истец|ответчик|апелляц|кассац|адвокат|обвин|подсудим|фас(?![\\p{L}])|антимонопол|взыска|мошенни|хищени|взятк|коррупц|правонаруш|закон(?:а|у|ом|ы|ов)?(?![\\p{L}])")],
  ["Происшествия", w("оперативник|изъя|наркот|нарколаб|убийств|убит|киллер|полици|мвд|уфсин|колони|ракетн|авари|дтп|пожар|возгоран|погиб|пострада|беспилотн|бпла|дрон|атак|обломк|задержан|сгорел|утонул|мчс|спасател|взрыв|ранен|травм|эвакуац|происшеств|чп(?![\\p{L}])")],
  ["Политика", w("выбор(?:ы|ах|ов|ам)?(?![\\p{L}])|избират|депутат|парти[яиюей]|единая россия|единой россии|кпрф|лдпр|справедлив(?:ая|ой) росси|кандидат|праймериз|облсовет|горсовет|облдум|госдум|голосован|мандат|фракци|сенатор")],
  ["Власть", w("губернатор|артамонов|мэр|глава город|главы город|глава липецк|главы липецк|щербаков|администрац|правительств|министр|министерств|ведомств|чиновник|вице-губернатор|госслуж|отставк|назначен|полпред|управлени[ея] (?:по|делами)")],
  ["Экономика", w("бюджет|рубл|млн|млрд|трлн|эконом|бизнес|предприят|производств|рынок|рынк|рыночн|зарплат|заработн|инвест|налог|ндфл|кредит|автокредит|ипотек|банк|цен(?:а|ы|у|ой|ам|ах|е)?(?![\\p{L}])|ценов|инфляц|тариф|выручк|прибыл|убыт|банкрот|долг|задолжен|нлмк|лисин|девелоп|сделк|оэз|экспорт|импорт|торгов|гипермаркет|ритейл|аренд|аукцион|госзакуп|контракт|подряд")],
  ["ЖКХ", w("жкх|коммунал|управляющ(?:ая|ей|ие|их) компан|мкд|многоквартирн|жиль|жилищн|капремонт|капитальн(?:ый|ого) ремонт|лифт|водоснабж|водопровод|канализац|отоплен|теплоснаб|теплосет|теплов(?:ая|ые|ых) сет|котельн|квартплат|ресурсоснаб|рир|раскоп|благоустр")],
  ["Образование", w("пионерлагер|школ|образован|университет|вуз|студент|егэ|огэ|колледж|учител|ректор|кампус|детск(?:ий|ого|ие|их) сад|лагер[ьяе]|оздоровит|школьник|выпускник")],
  ["Здоровье", w("врач|больниц|медицин|здравоохран|поликлиник|пациент|лечени|зож|болезн|здоровь|минздрав|госпитал|аптек|лекарств|вакцин|скор(?:ая|ой) помощ")],
  ["Транспорт", w("автодорог|дорожн|ям(?:ы|ах)? на дорог|трасс|автобус|транспорт|маршрут|трамва|пробк|мост(?:а|у|ом|ы)?(?![\\p{L}])|аэропорт|железнодорож|ржд|электричк|автомобил|такси|парковк")],
  ["Экология", w("эколог|выброс|отход|мусор|загрязн|воздух|водо[её]м|свалк|росприроднадзор|природ|лесн|вырубк|очистн")],
  ["Культура", w("театр|музе[йя]|фестивал|культур|выставк|концерт|режисс[её]р|фильм|кино(?![\\p{L}])|писател|библиотек|памятник|истори(?:я|и|ей) липецк")],
  ["Спорт", w("спорт|матч|футбол|хокке|турнир|стадион|чемпионат|олимпи|металлург-липецк|фк металлург")],
  ["Сельское хозяйство", w("сельхоз|урожай|зерн|скот|молок|мяс[оа](?![\\p{L}])|яйц|ферм|птицевод|птицефабр|агро|курин(?:ое|ого|ому) царств|посев|свин|аграри|минсельхоз|поле(?![\\p{L}])|пол(?:я|ей)(?![\\p{L}])")],
  ["Россия и мир", w("президент|путин|кремл|федеральн|росси[яиюей]|рф(?![\\p{L}])|москв|всу|сво(?![\\p{L}])|украин|беларус|белорус|сша|китай|кита[ея]|европ|мир(?:а|е|ов)?(?![\\p{L}])|международн|зарубеж")],
];

// Слова экономики и «России» встречаются почти в каждом посте канала — снижаем их вес.
const TOPIC_WEIGHT: Record<string, number> = { "Экономика": 0.7, "Россия и мир": 0.55, "Власть": 0.85 };

const ANALYTICS = w("статистик|анализ|аналитич|рейтинг|исследован|динамик|сравнени|доля|прогноз|корреляц|таблиц|диаграмм|в процентах|абирег|эксперт");

const LOCATION_RULES: Array<[string, RegExp]> = [
  ["Липецк", w("липецк(?:а|е|ом|у)?(?![\\p{L}])|липецкий городской|липчан|горсовет|мэри[ия] липецк")],
  ["Елец", w("ел(?:ец|ьц[аеуом]|ецк)")],
  ["Задонск", w("задонск")],
  ["Грязи", w("грязи(?![\\p{L}])|грязинск")],
  ["Данков", w("данков")],
  ["Лебедянь", w("лебедян")],
  ["Усмань", w("усман")],
  ["Чаплыгин", w("чаплыгин")],
  ["Регион", w("липецк(?:ая|ой|ую) област|област(?:и|ь|ной|ного|ном)|регион|район|округ|сел(?:о|а|е)(?![\\p{L}])|деревн|посел")],
];

const READERS = /@нампишут|нам пишут|пишут подписчик|пишет подписчик|письмо подписчик/i;

function countMatches(pattern: RegExp, text: string) {
  pattern.lastIndex = 0;
  return text.match(pattern)?.length ?? 0;
}

function classify(title: string, body: string) {
  const scores = TOPIC_RULES.map(([tag, pattern]) => ({
    tag,
    score: (countMatches(pattern, title) * 6 + Math.min(countMatches(pattern, body), 8)) * (TOPIC_WEIGHT[tag] ?? 1),
  }))
    .filter((item) => item.score >= 2.5)
    .sort((a, b) => b.score - a.score);

  const topics = scores.slice(0, 3).map((item) => item.tag);
  const full = `${title}\n${body}`;
  if (READERS.test(full)) topics.unshift("Нам пишут");
  const numbers = (body.match(/\d+[,.]?\d*\s?%/g) ?? []).length;
  if (countMatches(ANALYTICS, full) >= 2 || numbers >= 4) topics.push("Аналитика");
  if (topics.length === 0) topics.push("Общество");

  const places = LOCATION_RULES.filter(([, pattern]) => countMatches(pattern, full) > 0).map(([tag]) => tag);
  const districts = places.filter((place) => !["Липецк", "Регион"].includes(place));
  if (districts.length && !places.includes("Регион")) places.push("Регион");

  const tags = [...new Set([...topics, ...places.slice(0, 3)])];
  const category = topics.find((tag) => tag !== "Нам пишут" && tag !== "Аналитика") ?? topics[0];
  return { category, tags };
}

const COVERS: Record<string, string[]> = {
  "Суд и право": ["sud-1", "sud-2"],
  "Происшествия": ["proish-1", "proish-2"],
  "Экономика": ["ekonomika", "ekonomika-2"],
  "Власть": ["vlast"],
  "Политика": ["politika"],
  "ЖКХ": ["zhkh"],
  "Общество": ["obshchestvo"],
  "Нам пишут": ["obshchestvo", "zhkh"],
  "Аналитика": ["analitika"],
  "Здоровье": ["zdorovie"],
  "Сельское хозяйство": ["selhoz"],
  "Транспорт": ["transport"],
  "Экология": ["ekologiya"],
  "Образование": ["obrazovanie"],
  "Культура": ["obshchestvo"],
  "Спорт": ["obshchestvo"],
  "Россия и мир": ["rossiya"],
};

export function coverFor(category: string, id: string) {
  const list = COVERS[category] ?? COVERS["Общество"];
  return `/covers/${list[Number(id) % list.length]}.webp`;
}

/* ---------- заголовок ---------- */

const LEADING_SYMBOLS = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}☀-➿️‍⃣\s•·*—–\-❗️‼️]+/u;

function isNoiseLine(line: string) {
  const clean = line.replace(LEADING_SYMBOLS, "").trim();
  return (
    /^\(?\s*продолжение[^)]*\)?[:.]?$/i.test(clean) ||
    /^(видео|фото|иллюстрация|скрин|см\. скрин)[:.]?$/i.test(clean) ||
    /^@[\p{L}_\d]+$/u.test(clean) ||
    clean.replace(/[\d\s\p{P}]/gu, "").length < 4
  );
}

function firstSentence(text: string, limit = 120) {
  const match = text.match(/^(.{20,}?[.!?…])(\s|$)/u);
  const sentence = (match?.[1] ?? text).trim();
  return sentence.length > limit ? `${sentence.slice(0, limit - 1).replace(/\s+\S*$/, "")}…` : sentence;
}

function chooseTitle(lines: string[]) {
  let index = lines.findIndex((line) => !isNoiseLine(line));
  if (index < 0) index = 0;
  let title = (lines[index] ?? "Новая публикация").replace(LEADING_SYMBOLS, "").trim();
  let used = [index];

  // «Губернатор Игорь Артамонов:» — короткая подводка, к ней добавляем первую фразу цитаты.
  const next = lines[index + 1];
  if (/:$/.test(title) && title.length < 70 && next && !isNoiseLine(next)) {
    title = `${title} ${firstSentence(next.replace(LEADING_SYMBOLS, ""), 110)}`;
    used = [index, index + 1];
  }

  title = title.replace(/[:;,]\s*$/, "").replace(/\s+/g, " ").trim();
  const fullTitle = title;
  if (title.length > 150) title = `${title.slice(0, 147).replace(/\s+\S*$/, "")}…`;
  return { title, fullTitle, used };
}

/** Убирает из начала текста строку, ставшую заголовком (теги оставляем, чтобы не сломать разметку). */
function removeTitleLine(html: string, titleLine: string) {
  const normalize = (value: string) => value.replace(LEADING_SYMBOLS, "").replace(/\s+/g, " ").trim();
  const target = normalize(titleLine);
  if (!target) return html;
  const segments = html.split(/<br>/);
  for (let index = 0; index < Math.min(segments.length, 6); index += 1) {
    const text = normalize(plainText(segments[index]));
    if (!text) continue;
    if (text === target) {
      segments[index] = segments[index].replace(/[^<>]+(?=<|$)/g, "");
      return segments.join("<br>");
    }
    if (!isNoiseLine(text)) break;
  }
  return html;
}

/* ---------- разбор страницы ---------- */

type RawPost = {
  id: number;
  dateIso: string;
  textHtml: string;
  text: string;
  images: Media[];
  video: Video | null;
  views: string;
  reactions: Reaction[];
  forwardedFrom: string | null;
};

function parseViews(value: string) {
  const match = value.replace(",", ".").match(/([\d.]+)\s*([KM])?/i);
  if (!match) return 0;
  const base = Number.parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();
  return Math.round(base * (unit === "K" ? 1000 : unit === "M" ? 1_000_000 : 1));
}

function extractTextHtml(block: string) {
  const start = block.indexOf('<div class="tgme_widget_message_text');
  if (start < 0) return "";
  const open = block.indexOf(">", start) + 1;
  // Учитываем вложенные div: ищем закрывающий тег своего уровня.
  let depth = 1;
  const tagRe = /<\/?div\b[^>]*>/g;
  tagRe.lastIndex = open;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(block))) {
    depth += match[0][1] === "/" ? -1 : 1;
    if (depth === 0) return block.slice(open, match.index).replace(/^<div[^>]*>|<\/div>$/g, "");
  }
  return block.slice(open);
}

function parsePage(html: string): RawPost[] {
  return html
    .split('<div class="tgme_widget_message_wrap')
    .slice(1)
    .map((block): RawPost | null => {
      const id = Number(block.match(/data-post="lippot\/(\d+)"/)?.[1]);
      const dateIso = block.match(/<time datetime="([^"]+)"/)?.[1];
      if (!id || !dateIso) return null;

      const textHtml = extractTextHtml(block);
      const text = plainText(textHtml);

      const images: Media[] = [];
      const photoRe = /<a class="tgme_widget_message_photo_wrap([^"]*)"[^>]*style="([^"]*)"[^>]*>([\s\S]{0,400}?)<\/a>/g;
      let photo: RegExpExecArray | null;
      while ((photo = photoRe.exec(block))) {
        const src = photo[2].match(/background-image:url\('([^']+)'\)/)?.[1];
        if (!src) continue;
        const padding = photo[3].match(/padding-top:([\d.]+)%/)?.[1];
        images.push({ src: viaSite(decodeHtml(src)), ratio: padding ? Number.parseFloat(padding) / 100 : null });
      }

      const thumb = block.match(/tgme_widget_message_video_thumb"[^>]*background-image:url\('([^']+)'\)/)?.[1];
      const duration = block.match(/<time class="message_video_duration[^"]*">([^<]+)<\/time>/)?.[1] ?? "";
      const videoSrc = block.match(/<video src="([^"]+)"/)?.[1];
      const videoRatio = block.match(/tgme_widget_message_video_wrap"[^>]*padding-top:([\d.]+)%/)?.[1];
      const video: Video | null = thumb
        ? {
            thumb: viaSite(decodeHtml(thumb)),
            duration,
            src: videoSrc ? viaSite(decodeHtml(videoSrc)) : null,
            ratio: videoRatio ? Number.parseFloat(videoRatio) / 100 : null,
          }
        : null;

      const views = plainText(block.match(/<span class="tgme_widget_message_views">([\s\S]*?)<\/span>/)?.[1] ?? "");
      const reactions: Reaction[] = [];
      const reactionRe = /<span class="tgme_reaction[^"]*">([\s\S]*?)<\/span>/g;
      let reaction: RegExpExecArray | null;
      while ((reaction = reactionRe.exec(block))) {
        const emoji = reaction[1].match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? (reaction[1].includes("star") ? "⭐" : "");
        const count = plainText(reaction[1].replace(/<i[\s\S]*?<\/i>/g, ""));
        if (emoji && count) reactions.push({ emoji, count });
      }
      const forwardedFrom = plainText(block.match(/tgme_widget_message_forwarded_from_name"[^>]*>([\s\S]*?)<\/(?:a|span)>\s*<\/(?:span|div)>/)?.[1] ?? "") || null;

      return { id, dateIso, textHtml, text, images, video, views, reactions, forwardedFrom };
    })
    .filter((post): post is RawPost => Boolean(post));
}

function parseChannel(html: string): ChannelInfo {
  const counter = (type: string) =>
    html.match(new RegExp(`<span class="counter_value">([^<]+)</span>\\s*<span class="counter_type">${type}`))?.[1] ?? "";
  return {
    title: plainText(html.match(/tgme_channel_info_header_title"><span dir="auto">([\s\S]*?)<\/span>/)?.[1] ?? "") || "Липецкий котел",
    description: plainText(html.match(/tgme_channel_info_description">([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/\s*\S+@\S+\s*$/, ""),
    subscribers: counter("subscribers"),
    photos: counter("photos"),
    videos: counter("videos"),
  };
}

const CONTINUATION = /^\s*[\p{Extended_Pictographic}️\s]*\(?\s*продолжени[ея]/iu;

function formatDate(value: string, short = false) {
  const date = new Date(value);
  // Год показываем только у старых публикаций (их находит поиск по архиву).
  const otherYear = date.getUTCFullYear() !== new Date().getUTCFullYear();
  const options: Intl.DateTimeFormatOptions = short
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }
    : { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" };
  if (otherYear) {
    options.year = "numeric";
    delete options.hour;
    delete options.minute;
  }
  return new Intl.DateTimeFormat("ru-RU", options).format(date).replace(" г.", "").replace(",", " ·");
}

function buildPosts(raw: RawPost[]): NewsPost[] {
  const sorted = [...raw].sort((a, b) => a.id - b.id);
  type Group = { head: RawPost; parts: RawPost[] };
  const groups: Group[] = [];

  for (const post of sorted) {
    const previous = groups[groups.length - 1];
    const gap = previous ? new Date(post.dateIso).getTime() - new Date(previous.parts[previous.parts.length - 1].dateIso).getTime() : Infinity;
    const isContinuation = CONTINUATION.test(post.text);
    // «(продолжение)» и сообщения без текста (досланные фото) приклеиваем к предыдущей публикации.
    if (previous && gap < 3 * 60 * 60 * 1000 && (isContinuation || (!post.text && gap < 10 * 60 * 1000))) {
      previous.parts.push(post);
      continue;
    }
    if (!post.text && !post.images.length && !post.video) continue;
    groups.push({ head: post, parts: [post] });
  }

  return groups
    .filter((group) => group.parts.some((part) => part.text.length >= 24))
    .map(({ head, parts }) => {
      const text = parts.map((part) => part.text).filter(Boolean).join("\n\n");
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      const { title, fullTitle, used } = chooseTitle(lines);
      const body = lines.filter((_, index) => !used.includes(index)).join("\n");
      const compact = body.replace(/^\(?\s*продолжени[ея][^)\n]*\)?\s*/i, "").replace(/\s+/g, " ").trim();
      const excerpt = compact.length > 260 ? `${compact.slice(0, 257).replace(/\s+\S*$/, "")}…` : compact;
      const { category, tags } = classify(title, body);

      const htmlParts = parts
        .map((part, index) => {
          let clean = sanitizeHtml(part.textHtml);
          if (index === 0) clean = removeTitleLine(clean, lines[used[0]] ?? "");
          // «(продолжение)» убираем и у склеенных частей, и у одиночных продолжений, найденных поиском.
          if (index > 0 || CONTINUATION.test(part.text)) clean = clean.replace(/^\s*(?:<[^>]+>\s*)*\(?\s*продолжени[ея][^<]*?(\)|<br>)/i, "");
          return toParagraphs(clean);
        })
        .filter(Boolean);
      const html = htmlParts.join('<hr class="part-break">');

      const images = parts.flatMap((part) => part.images);
      const video = parts.find((part) => part.video)?.video ?? null;
      const reactions = head.reactions;
      const reactionsCount = reactions.reduce((sum, item) => sum + parseViews(item.count), 0);
      const words = text.split(/\s+/).length;

      return {
        id: String(head.id),
        title,
        fullTitle,
        excerpt,
        html,
        category,
        tags,
        date: formatDate(head.dateIso),
        dateShort: formatDate(head.dateIso, true),
        dateIso: head.dateIso,
        views: head.views,
        viewsCount: parseViews(head.views),
        url: `${TELEGRAM_CHANNEL}/${head.id}`,
        images,
        video,
        cover: images.length || video ? null : coverFor(category, String(head.id)),
        reactions,
        reactionsCount,
        forwardedFrom: head.forwardedFrom,
        readMinutes: Math.max(1, Math.round(words / 180)),
        parts: parts.slice(1).map((part) => String(part.id)),
      };
    })
    .sort((a, b) => Number(b.id) - Number(a.id));
}

/* ---------- загрузка ---------- */

async function fetchPage(before: number | null, query = "") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (before) params.set("before", String(before));
  const url = params.size ? `${TELEGRAM_FEED}?${params}` : TELEGRAM_FEED;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept-Language": "ru-RU,ru;q=0.9",
    },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`Telegram ${response.status}`);
  return response.text();
}

/** Лента за `days` дней прямо из Telegram (сайт — за 30 дней; сборщик статичной копии берёт и архив подлиннее). */
export async function loadFromTelegram(days = ARCHIVE_DAYS, maxRequests = MAX_REQUESTS): Promise<Feed> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const firstHtml = await fetchPage(null);
  const channel = parseChannel(firstHtml);
  const collected = new Map<number, RawPost>();
  const firstPage = parsePage(firstHtml);
  firstPage.forEach((post) => collected.set(post.id, post));
  if (!firstPage.length) throw new Error("empty feed");

  let before = Math.min(...firstPage.map((post) => post.id));
  let oldest = Math.min(...firstPage.map((post) => new Date(post.dateIso).getTime()));
  let requests = 1;
  let completeMonth = oldest <= cutoff;

  while (!completeMonth && before > 1 && requests < maxRequests) {
    const batch = Array.from({ length: PARALLEL }, (_, index) => before - index * PAGE_STEP).filter((value) => value > 1);
    requests += batch.length;
    const pages = await Promise.allSettled(batch.map((value) => fetchPage(value)));
    let gotAny = false;
    for (const page of pages) {
      if (page.status !== "fulfilled") continue;
      for (const post of parsePage(page.value)) {
        gotAny = true;
        collected.set(post.id, post);
        oldest = Math.min(oldest, new Date(post.dateIso).getTime());
      }
    }
    if (!gotAny) break;
    before = Math.min(...collected.keys());
    completeMonth = oldest <= cutoff;
  }

  const fresh = [...collected.values()].filter((post) => new Date(post.dateIso).getTime() >= cutoff);
  return { posts: buildPosts(fresh), channel, live: true, completeMonth, fetchedAt: Date.now() };
}

const FALLBACK: Feed = {
  posts: [],
  channel: { title: "Липецкий котел", description: "", subscribers: "", photos: "", videos: "" },
  live: false,
  completeMonth: false,
  fetchedAt: 0,
};

let memory: Feed | null = null;
let inflight: Promise<Feed> | null = null;

type EdgeCache = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };
export function edgeCache(): EdgeCache | null {
  const store = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches;
  return store?.default ?? null;
}

export async function getFeed(): Promise<Feed> {
  if (STATIC_FEED) return STATIC_FEED;
  const now = Date.now();
  if (memory && now - memory.fetchedAt < CACHE_TTL_MS) return memory;

  const cache = edgeCache();
  if (cache) {
    try {
      const hit = await cache.match(new Request(CACHE_KEY));
      if (hit) {
        const data = (await hit.json()) as Feed;
        if (now - data.fetchedAt < CACHE_TTL_MS) {
          memory = data;
          return data;
        }
      }
    } catch {
      /* кеш недоступен — грузим напрямую */
    }
  }

  inflight ??= loadFromTelegram()
    .then(async (data) => {
      memory = data;
      if (cache) {
        try {
          await cache.put(
            new Request(CACHE_KEY),
            new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900" } })
          );
        } catch {
          /* без кеша тоже работаем */
        }
      }
      return data;
    })
    .catch(() => memory ?? FALLBACK)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/* ---------- поиск по всему архиву канала ---------- */

const SEARCH_TTL_MS = 10 * 60 * 1000;
const searchMemory = new Map<string, { at: number; posts: NewsPost[] }>();

/** Поиск Telegram по каналу: находит публикации за всё время, не только за последний месяц. */
export async function searchChannel(rawQuery: string): Promise<NewsPost[]> {
  const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, 80);
  if (query.length < 2) return [];
  const key = query.toLowerCase();

  const remembered = searchMemory.get(key);
  if (remembered && Date.now() - remembered.at < SEARCH_TTL_MS) return remembered.posts;

  const cache = edgeCache();
  const cacheKey = new Request(`https://feed-cache.lipetskiy-kotel.local/search-v1?q=${encodeURIComponent(key)}`);
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const posts = (await hit.json()) as NewsPost[];
        searchMemory.set(key, { at: Date.now(), posts });
        return posts;
      }
    } catch {
      /* без кеша */
    }
  }

  const raw = new Map<number, RawPost>();
  let before: number | null = null;
  // Две страницы ответа Telegram — до 40 совпадений, от новых к старым.
  for (let page = 0; page < 2; page += 1) {
    let html: string;
    try {
      html = await fetchPage(before, query);
    } catch {
      break;
    }
    const found = parsePage(html);
    found.forEach((post) => raw.set(post.id, post));
    const next = html.match(/href="\/s\/lippot\?q=[^"]*?before=(\d+)"/)?.[1];
    if (!next || found.length < 16) break;
    before = Number(next);
  }

  const posts = buildPosts([...raw.values()]);
  if (searchMemory.size > 60) searchMemory.delete(searchMemory.keys().next().value as string);
  searchMemory.set(key, { at: Date.now(), posts });
  if (cache) {
    try {
      await cache.put(cacheKey, new Response(JSON.stringify(posts), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" } }));
    } catch {
      /* без кеша */
    }
  }
  return posts;
}
