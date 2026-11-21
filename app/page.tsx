import { NewsGrid, type NewsPost } from "./NewsGrid";
import { CategoryNav } from "./CategoryNav";

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
  const lead = posts[0];
  const secondary = posts.slice(1, 3);
  const recommended = posts.slice(3, 7);
  const categories = ["Все новости", "Россия и мир", "Липецк", "Регион", "Суд и право", "Власть", "Политика", "Экономика", "Общество", "Аналитика", "ЖКХ", "Происшествия", "Спорт", "Здоровье"];

  return (
    <div className="site" id="top">
      <header className="site-header">
        <div className="shell site-header__main">
          <a className="brand" href="#top" aria-label="Липецкий котёл — на главную">
            <span className="brand__mark" aria-hidden="true"><span>ЛК</span></span>
            <span className="brand__copy">
              <strong><span>ЛИПЕЦКИЙ</span><b>КОТЁЛ</b></strong>
              <small>Новости и аналитика региона</small>
            </span>
          </a>
          <div className="header-tools" aria-label="Ссылки редакции">
            <a href="#news" aria-label="Перейти к поиску по новостям">⌕</a>
            <a href="https://max.ru/lippot" target="_blank" rel="noreferrer" aria-label="Канал в MAX">M</a>
            <a href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer" aria-label="Канал в Telegram">↗</a>
          </div>
        </div>
        <CategoryNav categories={categories} />
      </header>

      <main>
        <section className="front shell" aria-label="Главные новости">
          <aside className="brief-column">
            <div className="brief-tabs"><span>ГЛАВНОЕ В СТРАНЕ</span><span>В МИРЕ</span></div>
            <div className="brief-list">
              {posts.slice(1, 7).map((post) => (
                <a href={`#post-${post.id}`} key={post.id}><strong>{post.title}</strong><small>{post.category}</small></a>
              ))}
            </div>
            <a className="brief-more" href="#news">Читать все</a>
            <a className="social-row social-row--telegram" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer"><span>↗</span>Мы в Telegram</a>
            <a className="social-row social-row--max" href="https://max.ru/lippot" target="_blank" rel="noreferrer"><span>M</span>Мы в MAX</a>
          </aside>

          <div className="front__content">
            {lead && (
              <a className="lead-story" href={`#post-${lead.id}`}>
                {lead.image ? <img src={lead.image} alt={`Иллюстрация к новости «${lead.title}»`} /> : <span className="lead-story__placeholder">ЛК</span>}
                <span className="lead-story__shade" />
                <span className="lead-story__content"><small>{lead.category}&nbsp;&nbsp;·&nbsp;&nbsp;{lead.date}</small><strong>{lead.title}</strong></span>
              </a>
            )}
            <div className="front__grid">
              {secondary.map((post) => (
                <a className="front-card" href={`#post-${post.id}`} key={post.id}>
                  <span className="front-card__media">
                    {post.image ? <img src={post.image} alt="" /> : <span className="front-card__placeholder">ЛК</span>}
                    <span><b>{post.category}</b><time>{post.date}</time></span>
                  </span>
                  <strong>{post.title}</strong>
                  <small>{post.excerpt}</small>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="recommend shell" aria-labelledby="recommend-title">
          <div className="recommend__heading"><h2 id="recommend-title">Рекомендуем</h2><span>{now}</span></div>
          <div className="recommend__grid">
            {recommended.map((post) => (
              <a href={`#post-${post.id}`} key={post.id}>
                <span className="recommend__media">{post.image ? <img src={post.image} alt="" /> : <span>ЛК</span>}<b>{post.category}</b></span>
                <strong>{post.title}</strong>
              </a>
            ))}
          </div>
        </section>

        <section className="news-section shell" id="news">
          <div className="section-heading">
            <div><span className="section-kicker">Лента @lippot</span><h2>Все новости</h2></div>
            <p><span className={`status-dot ${live ? "is-live" : ""}`} />{posts.length} публикаций {completeMonth ? "за 30 дней" : "загружено"}</p>
          </div>
          <NewsGrid posts={posts} />
        </section>

        <section className="subscribe-strip" id="about">
          <div className="shell subscribe-strip__inner">
            <div><span>ЛИПЕЦКИЙ КОТЁЛ</span><h2>Новости без лишнего шума</h2><p>Факты, аналитика и события Липецка и области — в удобном для вас канале.</p></div>
            <div><a className="button button--primary" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">Подписаться в Telegram ↗</a><a className="button button--light" href="https://max.ru/lippot" target="_blank" rel="noreferrer">Открыть MAX ↗</a></div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell site-footer__inner">
          <div className="brand brand--footer">
            <span className="brand__mark" aria-hidden="true"><span>ЛК</span></span>
            <span className="brand__copy"><strong><span>ЛИПЕЦКИЙ</span><b>КОТЁЛ</b></strong><small>Новости и аналитика региона</small></span>
          </div>
          <div><strong>Рубрики</strong><a href="#news">Липецк</a><a href="#news">Регион</a><a href="#news">Экономика</a></div>
          <div><strong>Контакты</strong><a href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">Telegram</a><a href="https://max.ru/lippot" target="_blank" rel="noreferrer">MAX</a><a href="mailto:lipport@protonmail.com">Редакция</a></div>
          <p>© {new Date().getFullYear()} «Липецкий котёл»<br />Липецк и Липецкая область</p>
        </div>
      </footer>
    </div>
  );
}
