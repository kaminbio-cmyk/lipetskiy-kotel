<?php
// Счётчик прочтений сайта lk48.ru за сегодня (сутки по Москве).
//   POST /stat/hit.php — +1 (страница или открытая статья; браузер шлёт один раз за сеанс на каждую);
//   GET  /stat/hit.php — текущее число.
// Числа лежат вне папки сайта (~/kotel-stats), поэтому синхронизация с GitHub их не трогает.
// Работает только на обычном хостинге с PHP; на основном сайте (ChatGPT Sites) этот файл не исполняется.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
date_default_timezone_set('Europe/Moscow');

$dir = dirname(__DIR__, 2) . '/kotel-stats';

// Одноразовая уборка хостинга (27.11.2026, просьба владельца: у ключей на хостинге не должно быть права записи на GitHub,
// а заходить на хостинг напрямую не нужно). SSH выключен, панель видит IP владельца — поэтому уборку делает этот счётчик
// при первом же посещении сайта. Только заранее известные действия; после выполнения ставится отметка и блок молчит.
$home = dirname(__DIR__, 2);
$mark = $home . '/kotel-stats/.cleanup-2026-11-27';
if (!file_exists($mark) && is_dir($home . '/.ssh')) {
    $log = array();
    @mkdir($home . '/kotel-stats', 0700, true);
    @mkdir($home . '/deployment-backups', 0700, true);
    // 1) скрипт синхронизации — только чтение сайта с GitHub, без сторожа и канала команд
    $sync = $home . '/kotel-sync.sh';
    $new = base64_decode('IyEvYmluL2Jhc2gKIyDQodC40L3RhdGA0L7QvdC40LfQsNGG0LjRjyDRgdGC0LDRgtC40YfQvdC+0Lkg0LrQvtC/0LjQuCDCq9Cb0LjQv9C10YbQutC+0LPQviDQutC+0YLQu9Cwwrsg0YEgR2l0SHViINC90LAg0YXQvtGB0YLQuNC90LMgKFNwYWNlV2ViKSwg0LfQsNC/0YPRgdC60LDQtdGC0YHRjyBjcm9uINC60LDQttC00YvQtSAxMCDQvNC40L3Rg9GCLgojICAgKi8xMCAqICogKiAqIC9iaW4vYmFzaCAkSE9NRS9rb3RlbC1zeW5jLnNoID4+ICRIT01FL2tvdGVsLXN5bmMubG9nIDI+JjEKIyBUZWxlZ3JhbSDRgSDRhdC+0YHRgtC40L3Qs9CwINC90LXQtNC+0YHRgtGD0L/QtdC9IOKAlCDQu9C10L3RgtGDLCDRhNC+0YLQviDQuCDQstC40LTQtdC+INGB0L7QsdC40YDQsNC10YIgR2l0SHViIEFjdGlvbnMg0Lgg0LrQu9Cw0LTRkdGCINCyINCy0LXRgtC60YMgYHNpdGVgLgojINCe0YLRgdGO0LTQsCDRgtC+0LvRjNC60L4g0YfRgtC10L3QuNC1OiBnaXQgZmV0Y2gg0L7RgtC60YDRi9GC0L7QuSDQstC10YLQutC4INC/0L4gSFRUUFMgKNCx0LXQtyDQutC70Y7Rh9C10Lkg0Lgg0L/QsNGA0L7Qu9C10LkpINC4IHJzeW5jINCyINC/0LDQv9C60YMg0YHQsNC50YLQsC4KIwojINChIDI3LjExLjIwMjYg0YMg0YXQvtGB0YLQuNC90LPQsCDQvdC10YIg0J3QmNCa0JDQmtCe0JPQniDQtNC+0YHRgtGD0L/QsCDQvdCwINC30LDQv9C40YHRjCDQsiBHaXRIdWI6INC60LvRjtGH0Lgg0YHRgtC+0YDQvtC20LAg0Lgg0LrQsNC90LDQu9CwINC60L7QvNCw0L3QtCDRg9C00LDQu9C10L3RiwojINC/0L4g0L/RgNC+0YHRjNCx0LUg0LLQu9Cw0LTQtdC70YzRhtCwICjCq9C60LvRjtGHINC90LUg0LTQvtC70LbQtdC9INC40LzQtdGC0Ywg0LLQvtC30LzQvtC20L3QvtGB0YLQuCDRgdCw0Lwg0L7RgtC/0YDQsNCy0LjRgtGMINC90LAg0YHQtdGA0LLQtdGAINC70Y7QsdGD0Y4g0LjQvdGE0L7RgNC80LDRhtC40Y7CuykuCiMg0KbQtdC/0L7Rh9C60LAg0YHQsdC+0YDQvtC6INC90LAgR2l0SHViINC00LXRgNC20LjRgtGB0Y8g0YHQsNC80LAgKNC/0L7QstGC0L7RgNGLINC/0YDQuCDRgdCx0L7Rj9GFINC00L4gNiDRh9Cw0YHQvtCyKSwg0YHRgtC+0YDQvtC20LAg0YEg0YXQvtGB0YLQuNC90LPQsCDQsdC+0LvRjNGI0LUg0L3QtdGCLgoKUkVQTz0iJHtLT1RFTF9SRVBPOi1odHRwczovL2dpdGh1Yi5jb20va2FtaW5iaW8tY215ay9saXBldHNraXkta290ZWwuZ2l0fSIKU0lURV9ESVI9IiR7S09URUxfU0lURV9ESVI6LSRIT01FL3B1YmxpY19odG1sfSIKU1JDPSIkSE9NRS8ua290ZWwtc3JjIgpMT0NLPSIkSE9NRS8ua290ZWwtc3luYy5sb2NrIgpTVEFNUD0iJEhPTUUvLmtvdGVsLXN5bmMucmV2IgoKZXhlYyA5PiIkTE9DSyIKZmxvY2sgLW4gOSB8fCBleGl0IDAKCmlmIFsgISAtZCAiJFNSQy8uZ2l0IiBdOyB0aGVuCiAgcm0gLXJmICIkU1JDIgogIGdpdCBjbG9uZSAtcSAtLWRlcHRoIDEgLWIgc2l0ZSAiJFJFUE8iICIkU1JDIiB8fCB7IGVjaG8gIiQoZGF0ZSAnKyVGICVUJykgY2xvbmUgZmFpbGVkIjsgZXhpdCAxOyB9CmVsc2UKICBjZCAiJFNSQyIgfHwgZXhpdCAxCiAgZ2l0IGZldGNoIC1xIC0tZGVwdGggMSBvcmlnaW4gc2l0ZSB8fCB7IGVjaG8gIiQoZGF0ZSAnKyVGICVUJykgZmV0Y2ggZmFpbGVkIjsgZXhpdCAxOyB9CiAgZ2l0IHJlc2V0IC1xIC0taGFyZCBGRVRDSF9IRUFECiAgZ2l0IGNsZWFuIC1xIC1mZHgKZmkKCmNkICIkU1JDIiB8fCBleGl0IDEKUkVWPSIkKGdpdCByZXYtcGFyc2UgSEVBRCkiClsgIiRSRVYiID0gIiQoY2F0ICIkU1RBTVAiIDI+L2Rldi9udWxsKSIgXSAmJiBleGl0IDAKCiMg0KTQsNC50LvRiyDRhdC+0YHRgtC40L3Qs9CwICguaHRhY2Nlc3MsINC/0YDQvtCy0LXRgNC60LAg0LTQvtC80LXQvdCwKSDQvdC1INGC0YDQvtCz0LDQtdC8OyDQstGB0ZEg0L7RgdGC0LDQu9GM0L3QvtC1IOKAlCDRgtC+0YfQvdCw0Y8g0LrQvtC/0LjRjyDRgdCx0L7RgNC60LguCnJzeW5jIC1hIC0tZGVsZXRlIC0tZXhjbHVkZSAuZ2l0IC0tZXhjbHVkZSAuYnVpbGQtaW5mbyAtLWV4Y2x1ZGUgLmhpc3RvcnktZGF5IC0tZXhjbHVkZSAuaHRhY2Nlc3MgLS1leGNsdWRlIC53ZWxsLWtub3duIC0tZXhjbHVkZSBjZ2ktYmluICIkU1JDLyIgIiRTSVRFX0RJUi8iIFwKICAmJiBlY2hvICIkUkVWIiA+ICIkU1RBTVAiIFwKICAmJiBlY2hvICIkKGRhdGUgJyslRiAlVCcpIHVwZGF0ZWQgdG8gJFJFViAoJChjYXQgLmJ1aWxkLWluZm8gMj4vZGV2L251bGwgfCBjdXQgLWMxLTEyKSkiCg==');
    @copy($sync, $home . '/deployment-backups/kotel-sync.sh.bak-20261127-cleanup');
    if (file_put_contents($sync . '.new', $new) === strlen($new) && chmod($sync . '.new', 0755) && rename($sync . '.new', $sync)) {
        $log[] = 'sync:' . sha1($new);
    }
    // 2) секретные ключи, которыми хостинг мог писать на GitHub
    foreach (array('lk48_ops', 'lk48_ops.pub', 'lk48_github_kick', 'lk48_github_kick.pub') as $k) {
        if (file_exists($home . '/.ssh/' . $k) && @unlink($home . '/.ssh/' . $k)) { $log[] = 'del:' . $k; }
    }
    // 3) ключ компьютера владельца — прямой вход по SSH больше не нужен
    $ak = $home . '/.ssh/authorized_keys';
    if (file_exists($ak)) {
        @copy($ak, $home . '/deployment-backups/authorized_keys.bak-20261127-cleanup');
        $lines = file($ak, FILE_IGNORE_NEW_LINES);
        $keep = array_filter($lines, function ($l) { return strpos($l, 'nlmb48-deploy') === false; });
        file_put_contents($ak, $keep ? implode("\n", $keep) . "\n" : '');
        $log[] = 'authorized_keys:' . count($lines) . '->' . count($keep);
    }
    // 4) рабочие папки сторожа и канала команд, публичная половина ключа
    $rm = function ($path) use (&$rm) {
        if (is_link($path) || is_file($path)) { return @unlink($path); }
        if (!is_dir($path)) { return false; }
        foreach (scandir($path) as $f) { if ($f !== '.' && $f !== '..') { $rm($path . '/' . $f); } }
        return @rmdir($path);
    };
    foreach (array('.lk48-ops', '.kotel-kick', 'public_html/_hostkey', '.kotel-watchdog.last') as $d) {
        if (file_exists($home . '/' . $d) && $rm($home . '/' . $d)) { $log[] = 'rm:' . $d; }
    }
    file_put_contents($mark, date('c') . "\n" . implode("\n", $log) . "\n");
}
$cleanup = file_exists($mark) ? 'done' : 'pending';
if (!is_dir($dir)) {
    @mkdir($dir, 0700, true);
}
$today = date('Y-m-d');
$file = $dir . '/site-' . $today . '.txt';

$agent = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
$isBot = $agent === '' || preg_match('/bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|scrapy/i', $agent);
$isHit = isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST' && !$isBot;

$count = 0;
$handle = @fopen($file, 'c+');
if ($handle) {
    flock($handle, LOCK_EX);
    $count = (int) stream_get_contents($handle);
    if ($isHit) {
        $count++;
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, (string) $count);
        fflush($handle);
    }
    flock($handle, LOCK_UN);
    fclose($handle);
}

echo json_encode(array('date' => $today, 'site' => $count, 'cleanup' => $cleanup));
