<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

const DATA_DIR = __DIR__ . '/data';
const DATA_FILE = DATA_DIR . '/stats.runtime.json';
const MAX_HIGHSCORES_PER_MODE = 50;
const MAX_TRACKED_USERS = 30;
const MAX_USER_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 12;
const MAX_COINS_PER_EVENT = 9999;
const MAX_SCORE_VALUE = 2000000000;

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
  exit;
}

function normalize_mode($raw): string {
  return $raw === 'daily' ? 'daily' : 'normal';
}

function normalize_user_id($raw): string {
  if (!is_string($raw)) {
    return '';
  }
  $trimmed = trim($raw);
  if ($trimmed === '') {
    return '';
  }
  $cleaned = preg_replace('/[^A-Za-z0-9._:-]/', '', $trimmed);
  if (!is_string($cleaned)) {
    return '';
  }
  return substr($cleaned, 0, MAX_USER_ID_LENGTH);
}

function normalize_name($raw): string {
  if (!is_string($raw)) {
    return '---';
  }
  $upper = strtoupper($raw);
  $clean = preg_replace('/[^A-Z0-9]/', '', $upper);
  if (!is_string($clean) || $clean === '') {
    return '---';
  }
  return substr($clean, 0, MAX_NAME_LENGTH);
}

function normalize_int($raw, int $min = 0, int $max = PHP_INT_MAX): int {
  if (is_int($raw)) {
    $value = $raw;
  } elseif (is_numeric($raw)) {
    $value = (int) floor((float) $raw);
  } else {
    $value = 0;
  }
  if ($value < $min) {
    return $min;
  }
  if ($value > $max) {
    return $max;
  }
  return $value;
}

function normalize_timestamp($raw, string $fallback): string {
  if (is_string($raw) && $raw !== '') {
    $ts = strtotime($raw);
    if ($ts !== false) {
      return gmdate('c', $ts);
    }
  }
  return $fallback;
}

function normalize_highscore_rows($raw): array {
  if (!is_array($raw)) {
    return [];
  }
  $rows = [];
  foreach ($raw as $entry) {
    if (!is_array($entry)) {
      continue;
    }
    $score = normalize_int($entry['score'] ?? 0, 0, MAX_SCORE_VALUE);
    if ($score <= 0) {
      continue;
    }
    $rows[] = [
      'name' => normalize_name($entry['name'] ?? '---'),
      'score' => $score,
      'timestamp' => is_string($entry['timestamp'] ?? null) ? $entry['timestamp'] : gmdate('c'),
    ];
  }
  usort($rows, static function (array $a, array $b): int {
    if ($a['score'] === $b['score']) {
      return strcmp($a['timestamp'], $b['timestamp']);
    }
    return $b['score'] <=> $a['score'];
  });
  return array_slice($rows, 0, MAX_HIGHSCORES_PER_MODE);
}

function prune_recent_users(array $users, int $maxUsers = MAX_TRACKED_USERS): array {
  if (count($users) <= $maxUsers) {
    return $users;
  }
  uksort($users, static function (string $a, string $b) use ($users): int {
    $tsA = strtotime((string) ($users[$a] ?? '')) ?: 0;
    $tsB = strtotime((string) ($users[$b] ?? '')) ?: 0;
    if ($tsA === $tsB) {
      return strcmp($a, $b);
    }
    // Descending by last-seen time.
    return $tsB <=> $tsA;
  });
  return array_slice($users, 0, $maxUsers, true);
}

function normalize_data($raw): array {
  if (!is_array($raw)) {
    $raw = [];
  }

  $coinsSpent = normalize_int($raw['coinsSpent'] ?? 0, 0, PHP_INT_MAX);
  $updatedAt = is_string($raw['updatedAt'] ?? null) ? $raw['updatedAt'] : gmdate('c');

  $users = [];
  if (is_array($raw['users'] ?? null)) {
    foreach ($raw['users'] as $userId => $timestamp) {
      $key = normalize_user_id((string) $userId);
      if ($key === '') {
        continue;
      }
      $users[$key] = normalize_timestamp($timestamp, $updatedAt);
    }
  }
  $users = prune_recent_users($users, MAX_TRACKED_USERS);

  $knownUsers = [];
  if (is_array($raw['knownUsers'] ?? null)) {
    foreach ($raw['knownUsers'] as $userId => $timestamp) {
      $key = normalize_user_id((string) $userId);
      if ($key === '') {
        continue;
      }
      $knownUsers[$key] = normalize_timestamp($timestamp, $updatedAt);
    }
  }
  // Backward compatibility: ensure currently active users are part of known users.
  foreach ($users as $userId => $timestamp) {
    if (!array_key_exists($userId, $knownUsers)) {
      $knownUsers[$userId] = $timestamp;
    }
  }
  $totalUsersEver = normalize_int($raw['totalUsersEver'] ?? count($knownUsers), 0, PHP_INT_MAX);
  if ($totalUsersEver < count($knownUsers)) {
    $totalUsersEver = count($knownUsers);
  }

  $highscoresRaw = is_array($raw['highscores'] ?? null) ? $raw['highscores'] : [];
  $normalRows = normalize_highscore_rows($highscoresRaw['normal'] ?? []);
  $dailyRows = normalize_highscore_rows($highscoresRaw['daily'] ?? []);

  return [
    'version' => 1,
    'coinsSpent' => $coinsSpent,
    'users' => $users,
    'knownUsers' => $knownUsers,
    'totalUsersEver' => $totalUsersEver,
    'highscores' => [
      'normal' => $normalRows,
      'daily' => $dailyRows,
    ],
    'updatedAt' => $updatedAt,
  ];
}

function load_data_locked(): array {
  if (!is_dir(DATA_DIR) && !mkdir(DATA_DIR, 0775, true) && !is_dir(DATA_DIR)) {
    respond(500, ['ok' => false, 'error' => 'Cannot create data directory']);
  }

  $fp = fopen(DATA_FILE, 'c+');
  if ($fp === false) {
    respond(500, ['ok' => false, 'error' => 'Cannot open data file']);
  }
  if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    respond(500, ['ok' => false, 'error' => 'Cannot lock data file']);
  }

  $size = filesize(DATA_FILE);
  $raw = '';
  if (is_int($size) && $size > 0) {
    $raw = fread($fp, $size);
    if ($raw === false) {
      flock($fp, LOCK_UN);
      fclose($fp);
      respond(500, ['ok' => false, 'error' => 'Cannot read data file']);
    }
  }

  $decoded = $raw !== '' ? json_decode($raw, true) : [];
  $data = normalize_data($decoded);

  return [$fp, $data];
}

function persist_data_and_unlock($fp, array $data): void {
  rewind($fp);
  ftruncate($fp, 0);
  fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
}

function snapshot_for_mode(array $data, string $mode): array {
  $totalUsers = normalize_int($data['totalUsersEver'] ?? 0, 0, PHP_INT_MAX);
  $activeUsers = count($data['users']);
  return [
    'ok' => true,
    'mode' => $mode,
    'highscores' => $data['highscores'][$mode],
    'coinsSpent' => $data['coinsSpent'],
    // Backward-compat field name kept, but now represents all-time total users.
    'uniqueUsers' => $totalUsers,
    'totalUsers' => $totalUsers,
    'activeUsers' => $activeUsers,
    'updatedAt' => $data['updatedAt'],
  ];
}

function add_highscore(array &$data, string $mode, string $name, int $score): void {
  if ($score <= 0) {
    return;
  }
  $rows = $data['highscores'][$mode];
  $rows[] = [
    'name' => $name,
    'score' => $score,
    'timestamp' => gmdate('c'),
  ];
  $data['highscores'][$mode] = normalize_highscore_rows($rows);
}

[$fp, $data] = load_data_locked();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$defaultMode = normalize_mode($_GET['mode'] ?? 'normal');

if ($method === 'GET') {
  flock($fp, LOCK_UN);
  fclose($fp);
  respond(200, snapshot_for_mode($data, $defaultMode));
}

if ($method !== 'POST') {
  flock($fp, LOCK_UN);
  fclose($fp);
  respond(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$body = file_get_contents('php://input');
$payload = is_string($body) ? json_decode($body, true) : null;
if (!is_array($payload)) {
  flock($fp, LOCK_UN);
  fclose($fp);
  respond(400, ['ok' => false, 'error' => 'Invalid JSON']);
}

$action = is_string($payload['action'] ?? null) ? $payload['action'] : '';
$mode = normalize_mode($payload['mode'] ?? $defaultMode);
$userId = normalize_user_id($payload['userId'] ?? '');
if ($userId !== '') {
  $nowIso = gmdate('c');
  $data['users'][$userId] = $nowIso;
  if (!array_key_exists($userId, $data['knownUsers'])) {
    $data['knownUsers'][$userId] = $nowIso;
    $data['totalUsersEver'] = normalize_int($data['totalUsersEver'] ?? 0, 0, PHP_INT_MAX) + 1;
  }
}

switch ($action) {
  case 'register_user':
    break;

  case 'consume_coins':
    $amount = normalize_int($payload['amount'] ?? 0, 0, MAX_COINS_PER_EVENT);
    $data['coinsSpent'] += $amount;
    break;

  case 'submit_highscore':
    $score = normalize_int($payload['score'] ?? 0, 0, MAX_SCORE_VALUE);
    $name = normalize_name($payload['name'] ?? '---');
    add_highscore($data, $mode, $name, $score);
    break;

  default:
    flock($fp, LOCK_UN);
    fclose($fp);
    respond(400, ['ok' => false, 'error' => 'Unknown action']);
}

$data['updatedAt'] = gmdate('c');
$data['users'] = prune_recent_users($data['users'], MAX_TRACKED_USERS);
persist_data_and_unlock($fp, $data);
respond(200, snapshot_for_mode($data, $mode));
