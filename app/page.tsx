import { NewsGrid, type NewsPost } from "./NewsGrid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TELEGRAM_CHANNEL = "https://t.me/lippot";
const TELEGRAM_FEED = "https://t.me/s/lippot";

const fallbackPosts: NewsPost[] = [
  {
    id: "fallback-1",
    title: "Особое мнение: цифры, которые стоит сравнить",
    excerpt:
      "В «Липецком котле» разбирают региональную статистику, решения и их реальную цену для жителей.",
    category: "Экономика",
    date: "Свежая публикация",
    views: "",
    url: TELEGRAM_CHANNEL,
    image: null,
  },
  {
    id: "fallback-2",
    title: "Главные события Липецка — с контекстом",
    excerpt:
      "Не просто новостная строка: факты, предыстория и вопросы, которые остаются после официальных сообщений.",
    category: "Город",
    date: "Свежая публикация",
    views: "",
    url: TELEGRAM_CHANNEL,
    image: null,
  },
  {
    id: "fallback-3",
    title: "Решения власти: что изменится для региона",
    excerpt:
      "Коротко и по существу о людях, проектах и бюджетах Липецкой области.",
    category: "Власть",
    date: "Свежая публикация",
    views: "",
    url: TELEGRAM_CHANNEL,
    image: null,
  },
  {
    id: "fallback-4",
    title: "Город говорит: истории и мнения жителей",
    excerpt:
      "Общественная повестка без канцелярита — о том, чем сегодня живут Липецк и районы области.",
    category: "Общество",
    date: "Свежая публикация",
    views: "",
    url: TELEGRAM_CHANNEL,
    image: null,
  },
];

function decodeHtml(value: string) {
  const entities: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    laquo: "«",
    raquo: "»",
    hellip: "…",
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

function categoryFor(text: string): NewsPost["category"] {
  const source = text.toLowerCase();
  if (/губернатор|мэр|администрац|министер|депутат|суд|прокуратур|чиновник/.test(source)) {
    return "Власть";
  }
  if (/цен|рубл|бюджет|эконом|бизнес|производств|рынок|зарплат|инвест/.test(source)) {
    return "Экономика";
  }
  if (/липецк|елец|задонск|улиц|дорог|район|город|област/.test(source)) {
    return "Город";
  }
  return "Общество";
}

function formatDate(value?: string) {
  if (!value) return "Сегодня";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Сегодня";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  })
    .format(date)
    .replace(" г.", "");
}

async function getTelegramPosts(): Promise<{ posts: NewsPost[]; live: boolean }> {
  try {
    const response = await fetch(TELEGRAM_FEED, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LipetskiyKotel/1.0; +https://t.me/lippot)",
      },
    });

    if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
    const html = await response.text();
    const blocks = html.split('<div class="tgme_widget_message_wrap').slice(1);

    const posts = blocks
      .map((block): NewsPost | null => {
        const id = block.match(/data-post="lippot\/(\d+)"/)?.[1];
        const textHtml = block.match(
          /<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/
        )?.[1];
        if (!id || !textHtml) return null;

        const text = plainText(textHtml);
        if (text.length < 24) return null;

        const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
        const rawTitle = lines[0] ?? text;
        const title = rawTitle.length > 116 ? `${rawTitle.slice(0, 113).trim()}…` : rawTitle;
        const rest = lines.slice(1).join(" ") || text.slice(rawTitle.length);
        const excerptSource = rest.trim() || text;
        const excerpt =
          excerptSource.length > 235
            ? `${excerptSource.slice(0, 232).trim()}…`
            : excerptSource;
        const photo = block.match(
          /tgme_widget_message_photo_wrap[\s\S]{0,700}?background-image:url\('([^']+)'\)/
        )?.[1];
        const videoThumb = block.match(
          /tgme_widget_message_video_thumb[\s\S]{0,700}?background-image:url\('([^']+)'\)/
        )?.[1];
        const datetime = block.match(/<time datetime="([^"]+)"/)?.[1];
        const views = plainText(
          block.match(/<span class="tgme_widget_message_views">([\s\S]*?)<\/span>/)?.[1] ?? ""
        );

        return {
          id,
          title,
          excerpt,
          category: categoryFor(text),
          date: formatDate(datetime),
          views,
          url: `${TELEGRAM_CHANNEL}/${id}`,
          image: photo ? decodeHtml(photo) : videoThumb ? decodeHtml(videoThumb) : null,
        };
      })
      .filter((post): post is NewsPost => Boolean(post))
      .slice(0, 10);

    return posts.length >= 3 ? { posts, live: true } : { posts: fallbackPosts, live: false };
  } catch {
    return { posts: fallbackPosts, live: false };
  }
}

export default async function Home() {
  const { posts, live } = await getTelegramPosts();
  const now = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
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
          <span className="button__dot" aria-hidden="true">↗</span>
          Подписаться
        </a>
      </header>

      <section className="hero shell" id="top">
        <div className="hero__copy">
          <div className="eyebrow"><span /> Независимая повестка региона</div>
          <h1>Что кипит<br />в Липецке?</h1>
          <p className="hero__lead">
            Факты, аналитика и события, которые меняют город. Читаем между строк — объясняем по существу.
          </p>
          <div className="hero__actions">
            <a className="button button--dark" href="#news">Читать новости <span>↓</span></a>
            <a className="text-link" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">Открыть @lippot ↗</a>
          </div>
          <div className="sync-note">
            <span className={`sync-note__pulse ${live ? "is-live" : ""}`} />
            {live ? "Лента обновлена из Telegram" : "Показываем редакционную подборку"}
          </div>
        </div>
        <div className="hero__visual">
          <img src="/og-v2.png" alt="Иллюстрация: новости Липецка кипят в сливовом котле" />
          <div className="hero__stamp" aria-label="Новости каждый день">
            <strong>24/7</strong><span>в повестке</span>
          </div>
        </div>
      </section>

      <section className="ticker" aria-label="Последние заголовки">
        <div className="ticker__label">Сейчас</div>
        <div className="ticker__track">
          {posts.slice(0, 3).map((post) => (
            <a key={post.id} href={post.url} target="_blank" rel="noreferrer">
              <span>●</span> {post.title}
            </a>
          ))}
        </div>
      </section>

      <section className="news-section shell" id="news">
        <div className="section-heading">
          <div>
            <div className="eyebrow"><span /> Лента @lippot</div>
            <h2>Последние новости</h2>
          </div>
          <p>Обновляется автоматически<br />при публикации в канале</p>
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
              <div>
                <span className="agenda__category">{post.category}</span>
                <h3>{post.title}</h3>
              </div>
              <a href={post.url} target="_blank" rel="noreferrer" aria-label={`Читать: ${post.title}`}>↗</a>
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
          <p>
            Интеллектуальный деловой канал о социально-экономической ситуации в регионе и стране. Аналитика, события и контекст, который часто остаётся за официальной статистикой.
          </p>
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
          <div className="brand brand--footer">
            <span className="brand__mark" aria-hidden="true">ЛК</span>
            <span className="brand__name">Липецкий<br />котёл</span>
          </div>
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
