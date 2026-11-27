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

# Управление хостингом без подключения к нему (с 27.11.2026). Хостинг сам забирает закрытое хранилище
# github.com/kaminbio-cmyk/lk48-ops, выполняет новые команды run/<имя>.sh (каждую один раз, до 4 минут, в домашней
# папке) и кладёт вывод в out/<имя>.log. Ни с какого компьютера по SSH сюда заходить не нужно: SpaceWeb видит только,
# как его сервер ходит на GitHub. Ключ ~/.ssh/lk48_ops создаётся здесь и сервер не покидает; его открытая половина
# лежит в $SITE_DIR/_hostkey/lk48_ops.pub — она добавлена в lk48-ops как deploy key с правом записи.
OPS_KEY="$HOME/.ssh/lk48_ops"
OPS_DIR="$HOME/.lk48-ops"
if [ ! -f "$OPS_KEY" ]; then
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  ssh-keygen -q -t ed25519 -N "" -C "lk48 ops (hosting lk48ru)" -f "$OPS_KEY"
fi
mkdir -p "$SITE_DIR/_hostkey" && cp -f "$OPS_KEY.pub" "$SITE_DIR/_hostkey/lk48_ops.pub" 2>/dev/null
ops_git() { GIT_SSH_COMMAND="ssh -i $OPS_KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new" git "$@"; }
if [ -d "$OPS_DIR/.git" ] || ops_git clone -q "git@github.com:kaminbio-cmyk/lk48-ops.git" "$OPS_DIR" >/dev/null 2>&1; then
  if cd "$OPS_DIR" && ops_git fetch -q origin main >/dev/null 2>&1 && git reset -q --hard origin/main; then
    for task in run/*.sh; do
      [ -e "$task" ] || continue
      name="$(basename "$task" .sh)"
      [ -e "out/$name.log" ] && continue
      ( cd "$HOME" && timeout 240 bash "$OPS_DIR/$task" ) > "out/$name.log" 2>&1
      echo "--- код завершения $? · $(date '+%F %T %Z')" >> "out/$name.log"
      git add "out/$name.log"
    done
    if ! git diff --cached --quiet; then
      git -c user.name="hosting lk48ru" -c user.email="ops@lk48.ru" commit -q -m "Ответы хостинга $(date '+%F %T')" \
        && ops_git push -q origin HEAD:main >/dev/null 2>&1 \
        || echo "$(date '+%F %T') ops: не удалось отправить ответы на GitHub"
    fi
  fi
  cd "$HOME" || exit 1
fi

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
# (сбой GitHub дольше 6 часов и т. п.), новой сборки нет — тогда хостинг сам запускает её: кладёт пустой коммит
# поверх main в ветку watchdog-kick, а на push в неё сборка запускается сама.
# Ключ ~/.ssh/lk48_github_kick создан на этом сервере и его не покидает; в GitHub — deploy key «lk48.ru watchdog»
# с правом записи только в это хранилище (lipetskiy-kotel); сторож пишет лишь в служебную ветку watchdog-kick.
# Правило-запрет на main для такого ключа GitHub не соблюдает (проверено 25.11.2026), поэтому его нет.
# Запускает не чаще раза в 30 минут; лишний запуск цепочке не вредит (её продолжает самый новый запуск).
# KOTEL_KICK_NOW=1 — проверить сторожа сразу, не дожидаясь 40 минут.
KICK_KEY="$HOME/.ssh/lk48_github_kick"
KICK_DIR="$HOME/.kotel-kick"
WATCH_STAMP="$HOME/.kotel-watchdog.last"
if [ -f "$KICK_KEY" ]; then
  NOW=$(date +%s)
  AGE=$(( NOW - $(git log -1 --format=%ct 2>/dev/null || echo "$NOW") ))
  LAST=$(cat "$WATCH_STAMP" 2>/dev/null || echo 0)
  if { [ "$AGE" -gt 2400 ] && [ $(( NOW - LAST )) -gt 1800 ]; } || [ "${KOTEL_KICK_NOW:-}" = "1" ]; then
    echo "$NOW" > "$WATCH_STAMP"
    RESULT="не удалось"
    if ( export GIT_SSH_COMMAND="ssh -i $KICK_KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
         [ -d "$KICK_DIR/.git" ] || git clone -q --depth 1 -b main "git@github.com:kaminbio-cmyk/lipetskiy-kotel.git" "$KICK_DIR" || exit 1
         cd "$KICK_DIR" || exit 1
         git fetch -q --depth 1 origin main && git reset -q --hard FETCH_HEAD || exit 1
         git -c user.name="lk48 watchdog" -c user.email="watchdog@lk48.ru" commit -q --allow-empty -m "Сторож lk48.ru: перезапуск сборки" || exit 1
         git push -q -f origin HEAD:refs/heads/watchdog-kick >/dev/null 2>&1 ); then
      RESULT="запущена"
    fi
    echo "$(date '+%F %T') сторож: новой сборки нет $((AGE / 60)) мин — сборка $RESULT"
  fi
fi

[ "$REV" = "$(cat "$STAMP" 2>/dev/null)" ] && exit 0

# Файлы хостинга (.htaccess, проверка домена) не трогаем; всё остальное — точная копия сборки.
rsync -a --delete --exclude .git --exclude .build-info --exclude .history-day --exclude .htaccess --exclude .well-known --exclude cgi-bin --exclude _hostkey "$SRC/" "$SITE_DIR/" \
  && echo "$REV" > "$STAMP" \
  && echo "$(date '+%F %T') updated to $REV ($(cat .build-info 2>/dev/null | cut -c1-12))"
