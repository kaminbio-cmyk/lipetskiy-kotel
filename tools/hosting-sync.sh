#!/bin/bash
# Синхронизация статичной копии «Липецкого котла» с GitHub на хостинг (SpaceWeb), запускается cron каждые 10 минут.
#   */10 * * * * $HOME/kotel-sync.sh >> $HOME/kotel-sync.log 2>&1
# Telegram с хостинга недоступен — ленту, фото и видео собирает GitHub Actions и кладёт в ветку `site`.
# Отсюда только git fetch (приходят лишь изменения) и rsync в папку сайта.

REPO="${KOTEL_REPO:-https://github.com/kaminbio-cmyk/lipetskiy-kotel.git}"
SITE_DIR="${KOTEL_SITE_DIR:-$HOME/public_html}"
SRC="$HOME/.kotel-src"
LOCK="$HOME/.kotel-sync.lock"
STAMP="$HOME/.kotel-sync.rev"

exec 9>"$LOCK"
flock -n 9 || exit 0

if [ ! -d "$SRC/.git" ]; then
  rm -rf "$SRC"
  git clone -q --depth 1 -b site "$REPO" "$SRC" || { echo "$(date '+%F %T') clone failed"; exit 1; }
else
  cd "$SRC" || exit 1
  git fetch -q --depth 1 origin site || { echo "$(date '+%F %T') fetch failed"; exit 1; }
  git reset -q --hard FETCH_HEAD
  git clean -q -fdx
fi

cd "$SRC" || exit 1
REV="$(git rev-parse HEAD)"

# Сторож. Сборки на GitHub идут цепочкой (каждая запускает следующую через ~10 минут). Если цепочка оборвалась
# (сбой GitHub дольше 6 часов и т. п.), новой сборки нет — тогда хостинг сам запускает её через API GitHub.
# Нужен ключ ~/.kotel-gh-token: fine-grained token GitHub только для этого хранилища, право Actions: Read and write.
# Без ключа сторож молчит. Запускает не чаще раза в 30 минут; лишний запуск цепочке не вредит (её продолжает самый новый).
TOKEN_FILE="$HOME/.kotel-gh-token"
WATCH_STAMP="$HOME/.kotel-watchdog.last"
if [ -s "$TOKEN_FILE" ]; then
  NOW=$(date +%s)
  AGE=$(( NOW - $(git log -1 --format=%ct 2>/dev/null || echo "$NOW") ))
  LAST=$(cat "$WATCH_STAMP" 2>/dev/null || echo 0)
  if [ "$AGE" -gt 2400 ] && [ $(( NOW - LAST )) -gt 1800 ]; then
    echo "$NOW" > "$WATCH_STAMP"
    CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 30 -X POST \
      -H "Authorization: Bearer $(tr -d ' \r\n' < "$TOKEN_FILE")" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/kaminbio-cmyk/lipetskiy-kotel/actions/workflows/static-hosting.yml/dispatches" \
      -d '{"ref":"main"}')
    echo "$(date '+%F %T') сторож: новой сборки нет $((AGE / 60)) мин — запуск на GitHub, ответ $CODE"
  fi
fi

[ "$REV" = "$(cat "$STAMP" 2>/dev/null)" ] && exit 0

# Файлы хостинга (.htaccess, проверка домена) не трогаем; всё остальное — точная копия сборки.
rsync -a --delete --exclude .git --exclude .build-info --exclude .history-day --exclude .htaccess --exclude .well-known --exclude cgi-bin "$SRC/" "$SITE_DIR/" \
  && echo "$REV" > "$STAMP" \
  && echo "$(date '+%F %T') updated to $REV ($(cat .build-info 2>/dev/null | cut -c1-12))"
