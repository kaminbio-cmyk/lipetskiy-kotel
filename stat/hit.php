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

echo json_encode(array('date' => $today, 'site' => $count));
