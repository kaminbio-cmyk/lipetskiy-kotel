#!/bin/bash
# Синхронизация статичной копии «Липецкого котла» с GitHub на хостинг (SpaceWeb), запускается cron каждые 10 минут.
#   */10 * * * * /bin/bash $HOME/kotel-sync.sh >> $HOME/kotel-sync.log 2>&1
# Telegram с хостинга недоступен — ленту, фото и видео собирает GitHub Actions и кладёт в ветку `site`.
# Отсюда только чтение: git fetch открытой ветки по HTTPS (без ключей и паролей) и rsync в папку сайта.
#
# С 27.11.2026 у хостинга нет НИКАКОГО доступа на запись в GitHub: ключи сторожа и канала команд удалены
# по просьбе владельца («ключ не должен иметь возможности сам отправить на сервер любую информацию»).
# Цепочка сборок на GitHub держится сама (повторы при сбоях до 6 часов), сторожа с хостинга больше нет.

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
[ "$REV" = "$(cat "$STAMP" 2>/dev/null)" ] && exit 0

# Файлы хостинга (.htaccess, проверка домена) не трогаем; всё остальное — точная копия сборки.
rsync -a --delete --exclude .git --exclude .build-info --exclude .history-day --exclude .htaccess --exclude .well-known --exclude cgi-bin "$SRC/" "$SITE_DIR/" \
  && echo "$REV" > "$STAMP" \
  && echo "$(date '+%F %T') updated to $REV ($(cat .build-info 2>/dev/null | cut -c1-12))"
