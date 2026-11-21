import { BriefTabs, type BriefItem } from "./BriefTabs";
import { CategoryNav } from "./CategoryNav";
import { NewsGrid } from "./NewsGrid";
import { FilterLink, SearchButton, TopicChips } from "./TopicChips";
import { BrandMark, EyeIcon, TelegramIcon } from "./icons";
import { EDITOR_EMAIL, MAX_CHANNEL, TELEGRAM_CHANNEL, getFeed, type NewsPost } from "./lib/telegram";
import { NAV_CATEGORIES, formatCount, plural } from "./lib/format";

export const dynamic = "force-dynamic";

const hasMedia = (post: NewsPost) => post.images.length > 0 || Boolean(post.video);
const mediaOf = (post: NewsPost) => post.images[0]?.src ?? post.video?.thumb ?? post.cover;

function timeOf(post: NewsPost) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(post.dateIso));
}

function brief(post: NewsPost, meta: string): BriefItem {
  return { id: post.id, title: post.title, category: post.category, meta };
}

function Media({ post, eager = false }: { post: NewsPost; eager?: boolean }) {
  const src = mediaOf(post);
  if (!src) return null;
  return (
    <span className="media-box">
      <img className="media-box__blur" src={src} alt="" aria-hidden="true" loading={eager ? "eager" : "lazy"} />
      <img className="media-box__img" src={src} alt={post.title} loading={eager ? "eager" : "lazy"} />
    </span>
  );
}

export default async function Home() {
  const feed = await getFeed();
  const { posts, channel } = feed;
  const today = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(new Date());
  const updated = feed.fetchedAt
    ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(feed.fetchedAt))
    : "";

  const lead = posts.find(hasMedia) ?? posts[0];
  const secondary = posts.filter((post) => post.id !== lead?.id && hasMedia(post)).slice(0, 2);
  const used = new Set([lead?.id, ...secondary.map((post) => post.id)]);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const week = posts.filter((post) => new Date(post.dateIso).getTime() >= weekAgo);
  const pool = week.length >= 6 ? week : posts;
  const mostRead = [...pool].sort((a, b) => b.viewsCount - a.viewsCount).slice(0, 6);
  const discussed = [...pool].filter((post) => post.reactionsCount > 0).sort((a, b) => b.reactionsCount - a.reactionsCount).slice(0, 6);
  const fresh = posts.filter((post) => post.id !== lead?.id).slice(0, 6);
  const recommended = [...posts]
    .filter((post) => !used.has(post.id))
    .slice(0, 40)
    .sort((a, b) => b.viewsCount - a.viewsCount)
    .slice(0, 4);

  const tagCounts: Record<string, number> = {};
  posts.forEach((post) => post.tags.forEach((tag) => (tagCounts[tag] = (tagCounts[tag] ?? 0) + 1)));
  const topics = Object.entries(tagCounts)
    .filter(([tag]) => tag !== "Регион")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([tag, count]) => ({ tag, count }));
  const ticker = posts.slice(0, 12);
  const totalViews = posts.reduce((sum, post) => sum + post.viewsCount, 0);

  return (
    <div className="site" id="top">
      <header className="site-header">
        <div className="shell site-header__main">
          <a className="brand" href="#top" aria-label="Липецкий котёл — на главную">
            <BrandMark />
            <span className="brand__copy">
              <strong><span>ЛИПЕЦКИЙ</span> <b>КОТЁЛ</b></strong>
              <small>Новости и аналитика Липецкого края</small>
            </span>
          </a>
          <div className="header-tools">
            <span className="header-date">{today}</span>
            <SearchButton />
            <a className="subscribe-pill" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">
              <TelegramIcon />
              <span>Подписаться</span>
              {channel.subscribers && <b>{formatCount(channel.subscribers)}</b>}
            </a>
            <a className="max-pill" href={MAX_CHANNEL} target="_blank" rel="noreferrer" aria-label="Канал в мессенджере MAX">MAX</a>
          </div>
        </div>
        <CategoryNav categories={NAV_CATEGORIES} counts={tagCounts} />
      </header>

      {ticker.length > 0 && (
        <div className="ticker" aria-label="Последние публикации">
          <span className="ticker__label"><i aria-hidden="true" />Лента</span>
          <div className="ticker__track">
            <div className="ticker__move">
              {[...ticker, ...ticker].map((post, index) => (
                <a href={`#post-${post.id}`} key={`${post.id}-${index}`} aria-hidden={index >= ticker.length ? "true" : undefined} tabIndex={index >= ticker.length ? -1 : undefined}>
                  <time>{timeOf(post)}</time>
                  {post.title}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      <main>
        <section className="front shell" aria-label="Главные новости">
          <aside className="brief-column">
            <BriefTabs
              tabs={[
                { key: "fresh", label: "Свежее", items: fresh.map((post) => brief(post, timeOf(post))) },
                { key: "read", label: "Читаемое", items: mostRead.map((post) => brief(post, `${formatCount(post.views)} просм.`)) },
                { key: "hot", label: "Обсуждают", items: (discussed.length ? discussed : mostRead).map((post) => brief(post, post.reactions.slice(0, 3).map((r) => `${r.emoji}${r.count}`).join(" "))) },
              ]}
            />
            <a className="brief-more" href="#news">Вся лента за месяц</a>
            <a className="social-row social-row--telegram" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">
              <span><TelegramIcon /></span>
              <em>Мы в Telegram</em>
              {channel.subscribers && <b>{formatCount(channel.subscribers)}</b>}
            </a>
            <a className="social-row social-row--max" href={MAX_CHANNEL} target="_blank" rel="noreferrer">
              <span>M</span>
              <em>Мы в MAX</em>
            </a>
          </aside>

          <div className="front__content">
            {lead && (
              <a className="lead-story" href={`#post-${lead.id}`}>
                <span className="lead-story__media">
                  {mediaOf(lead) && (
                    <>
                      <img className="media-box__blur" src={mediaOf(lead)!} alt="" aria-hidden="true" />
                      <img className="lead-story__img" src={mediaOf(lead)!} alt={lead.title} />
                    </>
                  )}
                  {lead.video && <span className="media-badge media-badge--play">▶ {lead.video.duration || "Видео"}</span>}
                  {lead.images.length > 1 && <span className="media-badge">{lead.images.length} фото</span>}
                </span>
                <span className="lead-story__content">
                  <span className="lead-story__meta">
                    <b className="chip chip--fire">Главное</b>
                    <span>{lead.category}</span>
                    <time dateTime={lead.dateIso}>{lead.date}</time>
                  </span>
                  <strong>{lead.title}</strong>
                  {lead.excerpt && <span className="lead-story__excerpt">{lead.excerpt}</span>}
                  <span className="lead-story__stats">
                    {lead.views && <span><EyeIcon />{formatCount(lead.views)}</span>}
                    <span>{lead.readMinutes} мин чтения</span>
                    {lead.reactions.slice(0, 4).map((reaction) => (
                      <span key={reaction.emoji}>{reaction.emoji} {reaction.count}</span>
                    ))}
                    <span className="lead-story__cta">Читать полностью →</span>
                  </span>
                </span>
              </a>
            )}
            <div className="front__grid">
              {secondary.map((post) => (
                <a className="front-card" href={`#post-${post.id}`} key={post.id}>
                  <Media post={post} eager />
                  <span className="front-card__body">
                    <span className="front-card__meta"><b className="chip">{post.category}</b><time dateTime={post.dateIso}>{post.dateShort}</time></span>
                    <strong>{post.title}</strong>
                    <small>{post.excerpt}</small>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {recommended.length > 0 && (
          <section className="recommend shell" aria-labelledby="recommend-title">
            <div className="recommend__heading">
              <h2 id="recommend-title">Рекомендуем</h2>
              <span>Самое читаемое за последние дни</span>
            </div>
            <div className="recommend__grid">
              {recommended.map((post, index) => (
                <a href={`#post-${post.id}`} key={post.id}>
                  <span className="recommend__media">
                    <Media post={post} />
                    <span className="recommend__rank">{index + 1}</span>
                  </span>
                  <b className="chip">{post.category}</b>
                  <strong>{post.title}</strong>
                  <small><EyeIcon />{formatCount(post.views)} · {post.dateShort}</small>
                </a>
              ))}
            </div>
          </section>
        )}

        {topics.length > 0 && (
          <section className="topics shell" aria-labelledby="topics-title">
            <div>
              <span className="section-kicker">Повестка месяца</span>
              <h2 id="topics-title">О чём пишет «Котёл»</h2>
            </div>
            <TopicChips topics={topics} />
          </section>
        )}

        <section className="news-section shell" id="news">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Лента @lippot · обновляется сама</span>
              <h2>Все новости</h2>
            </div>
            <p>
              <span className={`status-dot ${feed.live ? "is-live" : ""}`} />
              {feed.live ? `Обновлено в ${updated}` : "Telegram временно не ответил"} · {posts.length} {plural(posts.length, "публикация", "публикации", "публикаций")} {feed.completeMonth ? "за 30 дней" : ""}
            </p>
          </div>
          {posts.length > 0 ? (
            <NewsGrid posts={posts} />
          ) : (
            <div className="empty-state">
              Лента Telegram сейчас недоступна. Свежие публикации — в канале <a href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">@lippot</a>.
            </div>
          )}
        </section>

        <section className="about-band" id="about">
          <div className="shell about-band__inner">
            <BrandMark size="lg" />
            <div className="about-band__copy">
              <span className="section-kicker">Telegram-канал @lippot</span>
              <h2>Липецкий котёл</h2>
              <p>{channel.description || "Аналитика, события и то, что скрывается за статистикой: социально-экономическая ситуация в Липецке, области и стране."}</p>
              <div className="about-band__buttons">
                <a className="button button--primary" href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer"><TelegramIcon /> Подписаться в Telegram</a>
                <a className="button button--glass" href={MAX_CHANNEL} target="_blank" rel="noreferrer">Читать в MAX</a>
                <a className="button button--glass" href={`mailto:${EDITOR_EMAIL}`}>Написать в редакцию</a>
              </div>
            </div>
            <dl className="about-band__stats">
              {channel.subscribers && <div><dt>подписчиков</dt><dd>{formatCount(channel.subscribers)}</dd></div>}
              <div><dt>публикаций за месяц</dt><dd>{posts.length}</dd></div>
              {totalViews > 0 && <div><dt>просмотров за месяц</dt><dd>{formatCount(totalViews >= 1000 ? `${(totalViews / 1000).toFixed(0)}K` : String(totalViews))}</dd></div>}
              {channel.photos && <div><dt>фото в архиве</dt><dd>{formatCount(channel.photos)}</dd></div>}
            </dl>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell site-footer__inner">
          <div className="brand brand--footer">
            <BrandMark />
            <span className="brand__copy"><strong><span>ЛИПЕЦКИЙ</span> <b>КОТЁЛ</b></strong><small>Новости и аналитика Липецкого края</small></span>
          </div>
          <div>
            <strong>Рубрики</strong>
            {["Липецк", "Регион", "Экономика", "Власть", "Суд и право", "ЖКХ"].map((tag) => (
              <FilterLink key={tag} tag={tag}>{tag}</FilterLink>
            ))}
          </div>
          <div>
            <strong>Мы в сетях</strong>
            <a href={TELEGRAM_CHANNEL} target="_blank" rel="noreferrer">Telegram</a>
            <a href={MAX_CHANNEL} target="_blank" rel="noreferrer">MAX</a>
            <a href={`mailto:${EDITOR_EMAIL}`}>Редакция</a>
          </div>
          <p>© {new Date().getFullYear()} «Липецкий котёл»<br />Липецк и Липецкая область<br /><a href="#top">Наверх ↑</a></p>
        </div>
      </footer>
    </div>
  );
}
