import { NewsGrid, type NewsPost } from "./NewsGrid";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const TELEGRAM_CHANNEL = "https://t.me/lippot";
const TELEGRAM_FEED = "https://t.me/s/lippot";
const ARCHIVE_DAYS = 30;
const MAX_FEED_PAGES = 24;

const fallbackPosts: NewsPost[] = [
  {
    id: "fallback-1",
    title: "Свежие новости «Липецкого котла»",
    excerpt: "Telegram временно не ответил. Откройте канал, чтобы прочитать последние публикации редакции.",
    content: "Telegram временно не ответил. Все свежие публикации доступны в официальном канале «Липецкий котёл».",
    category: "Общество",
    tags: ["Общество", "Липецк"],
    date: "Сегодня",
    dateIso: new Date().toISOString(),
    views: "",
    url: TELEGRAM_CHANNEL,
    image: null,
  },
];

function decodeHtml(value: string) {
  const entities: Record<string, string> = {
    amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
    mdash: "—", ndash: "–", laquo: "«", raquo: "»", hellip: "…",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#")) {
      const hex = code[1]?.toLowerCase() === "x";
      const number = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    }
    return entities[code.toLowerCase()] ?? entity;
  });
}

function plainText(html: string) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>|<\/blockquote>|<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tagsFor(text: string) {
  const source = text.toLowerCase();
  const topicRules: Array<[string, RegExp]> = [
    ["Происшествия", /авари|дтп|пожар|задерж|погиб|пострадал|преступ/],
    ["Суд и право", /суд|прокуратур|следств|уголов|коап|иск|приговор|штраф/],
    ["Политика", /выбор|депутат|парт|кандидат|праймериз|облсовет|горсовет/],
    ["Власть", /губернатор|мэр|администрац|министер|чиновник|правительств/],
    ["Экономика", /цен|рубл|бюджет|эконом|бизнес|производств|рынок|зарплат|инвест|долг|налог/],
    ["ЖКХ", /жкх|коммунал|управляющ|мкд|жил(?:ой|ьё)|лифт|водоснабж|отоплен/],
    ["Образование", /школ|образован|университет|вуз|студент|егэ|огэ|колледж|учеб/],
    ["Здравоохранение", /врач|больниц|медицин|здравоохран|поликлин|пациент/],
    ["Транспорт", /дорог|автобус|транспорт|мост|маршрут|трамва|движени/],
    ["Экология", /эколог|выброс|отход|мусор|загрязнен|воздух|водоём/],
    ["Культура", /театр|музей|фестивал|культур|выставк|книг|концерт/],
    ["Спорт", /спорт|матч|футбол|хокке|турнир|стадион/],
    ["Сельское хозяйство", /сельхоз|урожай|зерн|скот|молок|мяс|яиц|ферм/],
    ["Аналитика", /статист|анализ|рейтинг|цифр|сравнен|итог|динамик/],
    ["Россия", /президент|госдум|федеральн|росси[яй]/],
  ];
  const locationRules: Array<[string, RegExp]> = [
    ["Елец", /елец|елецк/],
    ["Задонск", /задонск/],
    ["Липецк", /липецк/],
    ["Липецкая область", /област|регион|район|округ/],
  ];

  const topics = topicRules.filter(([, pattern]) => pattern.test(source)).map(([tag]) => tag);
  const locations = locationRules.filter(([, pattern]) => pattern.test(source)).map(([tag]) => tag);
  if (topics.length === 0) topics.push("Общество");
  return [...new Set([...topics.slice(0, 4), ...locations.slice(0, 2)])];
}

function formatDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  }).format(date).replace(" г.", "");
}

function chooseTitle(lines: string[]) {
  const isNoise = (line: string) =>
    /^(\(?продолжение\)?|продолжение далее|видео|фото|иллюстрация)[:.]?$/i.test(line) ||
    line.replace(/[\d\s\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").length < 4;
  let index = lines.findIndex((line) => !isNoise(line));
  if (index < 0) index = 0;

  const next = lines[index + 1];
  if (next && lines[index].length < 180 && /[?!.]$/.test(lines[index]) && next.includes(":") && next.length > 30) {
    index += 1;
  }
  return { text: lines[index] ?? "Новая публикация", index };
}

function parseTelegramPage(html: string): NewsPost[] {
  return html
    .split('<div class="tgme_widget_message_wrap')
    .slice(1)
    .map((block): NewsPost | null => {
      const id = block.match(/data-post="lippot\/(\d+)"/)?.[1];
      const textHtml = block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)?.[1];
      const dateIso = block.match(/<time datetime="([^"]+)"/)?.[1];
      if (!id || !textHtml || !dateIso) return null;

      const text = plainText(textHtml);
      if (text.length < 24) return null;
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      const selectedTitle = chooseTitle(lines);
      const rawTitle = selectedTitle.text;
      const title = rawTitle.length > 145 ? `${rawTitle.slice(0, 142).trim()}…` : rawTitle;
      const bodyLines = lines.filter((_, index) => index !== selectedTitle.index);
      const content = bodyLines.join("\n") || text;
      const compactContent = content.replace(/\s+/g, " ").trim();
      const excerpt = compactContent.length > 285 ? `${compactContent.slice(0, 282).trim()}…` : compactContent;
      const tags = tagsFor(`${title}\n${content}`);
      const photo = block.match(/tgme_widget_message_photo_wrap[\s\S]{0,700}?background-image:url\('([^']+)'\)/)?.[1];
      const videoThumb = block.match(/tgme_widget_message_video_thumb[\s\S]{0,700}?background-image:url\('([^']+)'\)/)?.[1];
      const views = plainText(block.match(/<span class="tgme_widget_message_views">([\s\S]*?)<\/span>/)?.[1] ?? "");

      return {
        id,
        title,
        excerpt,
        content,
        category: tags[0] ?? "Общество",
        tags,
        date: formatDate(dateIso),
        dateIso,
        views,
        url: `${TELEGRAM_CHANNEL}/${id}`,
        image: photo ? decodeHtml(photo) : videoThumb ? decodeHtml(videoThumb) : null,
      };
    })
    .filter((post): post is NewsPost => Boolean(post));
}

async function getTelegramPosts(): Promise<{ posts: NewsPost[]; live: boolean; completeMonth: boolean }> {
  const cutoff = Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  const collected = new Map<string, NewsPost>();
  let before: string | null = null;
  let completeMonth = false;

  for (let page = 0; page < MAX_FEED_PAGES; page += 1) {
    try {
      const url = before ? `${TELEGRAM_FEED}?before=${before}` : TELEGRAM_FEED;
      const response = await fetch(url, {
        next: { revalidate: 300 },
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LipetskiyKotel/2.0; +https://t.me/lippot)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) break;

      const html = await response.text();
      const pagePosts = parseTelegramPage(html);
      if (pagePosts.length === 0) break;

      let oldestTimestamp = Number.POSITIVE_INFINITY;
      for (const post of pagePosts) {
        const timestamp = new Date(post.dateIso).getTime();
        oldestTimestamp = Math.min(oldestTimestamp, timestamp);
        if (timestamp >= cutoff) collected.set(post.id, post);
      }

      if (oldestTimestamp <= cutoff) {
        completeMonth = true;
        break;
      }

      const pageBefore = html.match(/href="\/s\/lippot\?before=(\d+)"/)?.[1];
      const fallbackBefore = String(Math.min(...pagePosts.map((post) => Number(post.id))));
      const nextBefore = pageBefore ?? fallbackBefore;
      if (!nextBefore || nextBefore === before) break;
      before = nextBefore;
    } catch {
      break;
    }
  }

  const posts = [...collected.values()].sort(
    (a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime()
  );
  return posts.length > 0
    ? { posts, live: true, completeMonth }
    : { posts: fallbackPosts, live: false, completeMonth: false };
}

export default async function Home() {
  const { posts, live, completeMonth } = await getTelegramPosts();
  const now = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow",
  }).format(new Date());

  return (
    <main>
      <div className="topline">
        <div className="shell topline__inner">
          <span>Липецк и область</span>
          <span className="topline__date">{now}</span>
          <a href="#news">Свежий выпуск ↓</a>
        </div>
      </div>

      <header className="site-header shell">
        <a className="brand" href="#top" aria-label="Липецкий котёл — на главную">
          <span className="brand__mark" aria-hidden="true">ЛК</span>
          <span className="brand__name">Липецкий<br />котёл</span>
        </a>
        <nav className="nav" aria-label="Основная навигация">
          <a href="#news">Новости</a>
          <a href="#agenda">Повестка</a>
          <a href="#about">О канале</a>
        </nav>
        <a className="button button--telegram header-cta" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">
          <span className="button__dot" aria-hidden="true">↗</span>Подписаться
        </a>
      </header>

      <section className="hero shell" id="top">
        <div className="hero__copy">
          <div className="eyebrow"><span /> Независимая повестка региона</div>
          <h1>Что кипит<br />в Липецке?</h1>
          <p className="hero__lead">Факты, аналитика и события, которые меняют город. Читаем между строк — объясняем по существу.</p>
          <div className="hero__actions">
            <a className="button button--dark" href="#news">Читать новости <span>↓</span></a>
            <a className="text-link" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">Открыть @lippot ↗</a>
          </div>
          <div className="sync-note">
            <span className={`sync-note__pulse ${live ? "is-live" : ""}`} />
            {live
              ? `${posts.length} публикаций ${completeMonth ? "за последние 30 дней" : "загружено из Telegram"}`
              : "Telegram временно недоступен — откройте канал"}
          </div>
        </div>
        <div className="hero__visual">
          <img src="/og-v2.png" alt="Иллюстрация: новости Липецка кипят в сливовом котле" />
          <div className="hero__stamp" aria-label="Новости каждый день"><strong>24/7</strong><span>в повестке</span></div>
        </div>
      </section>

      <section className="ticker" aria-label="Последние заголовки">
        <div className="ticker__label">Сейчас</div>
        <div className="ticker__track">
          {posts.slice(0, 3).map((post) => (
            <a key={post.id} href={`#post-${post.id}`}><span>●</span> {post.title}</a>
          ))}
        </div>
      </section>

      <section className="news-section shell" id="news">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span /> Архив @lippot за 30 дней</div>
            <h2>Новости за месяц</h2>
          </div>
          <p>{posts.length} публикаций<br />полный текст раскрывается по нажатию</p>
        </div>
        <NewsGrid posts={posts} />
      </section>

      <section className="agenda shell" id="agenda">
        <div className="agenda__intro">
          <div className="eyebrow eyebrow--light"><span /> Главное за минуту</div>
          <h2>Повестка,<br />которая касается вас</h2>
          <p>Три темы, с которых удобно начать знакомство с сегодняшней картиной дня.</p>
        </div>
        <ol className="agenda__list">
          {posts.slice(0, 3).map((post, index) => (
            <li key={post.id}>
              <span className="agenda__number">0{index + 1}</span>
              <div><span className="agenda__category">{post.category}</span><h3>{post.title}</h3></div>
              <a href={`#post-${post.id}`} aria-label={`Читать: ${post.title}`}>↓</a>
            </li>
          ))}
        </ol>
      </section>

      <section className="about shell" id="about">
        <div className="about__quote">
          <span className="quote-mark">“</span>
          <blockquote>Информация — это не шум.<br />Это возможность понимать,<br />что происходит на самом деле.</blockquote>
        </div>
        <div className="about__copy">
          <div className="eyebrow"><span /> О «Липецком котле»</div>
          <h2>Для тех, кто привык думать</h2>
          <p>Интеллектуальный деловой канал о социально-экономической ситуации в регионе и стране. Аналитика, события и контекст, который часто остаётся за официальной статистикой.</p>
          <div className="subscribe-card">
            <div><strong>Будьте в курсе</strong><span>Выберите удобный канал</span></div>
            <div className="subscribe-card__actions">
              <a className="button button--telegram" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">Telegram ↗</a>
              <a className="button button--max" href="https://max.ru/lippot" target="_blank" rel="noreferrer">MAX ↗</a>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="shell footer__inner">
          <div className="brand brand--footer"><span className="brand__mark" aria-hidden="true">ЛК</span><span className="brand__name">Липецкий<br />котёл</span></div>
          <p>© {new Date().getFullYear()} «Липецкий котёл»<br />Новости Липецка и Липецкой области</p>
          <div className="footer__links">
            <a href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">Telegram</a>
            <a href="https://max.ru/lippot" target="_blank" rel="noreferrer">MAX</a>
            <a href="mailto:lipport@protonmail.com">Редакция</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
