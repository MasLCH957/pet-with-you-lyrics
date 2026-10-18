const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const LRC_STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_META = /^\[(ar|ti|al|by|offset):(.*)\]$/i;
const USER_AGENT = 'pet-with-you-lyrics/0.1 (https://github.com/MasLCH957/pet-with-you-lyrics)';

function cleanText(value, max = 300) {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, max) : '';
}

function normalizeToken(value) {
  return cleanText(value, 300)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\-_.·・]+/g, '')
    .replace(/[()[\]{}'"“”‘’]/g, '');
}

function mediaKey(media) {
  return crypto
    .createHash('sha1')
    .update([normalizeToken(media.artist), normalizeToken(media.title), normalizeToken(media.album)].join('\n'))
    .digest('hex');
}

function timestampMs(minutes, seconds, fraction = '') {
  const minuteValue = Number(minutes);
  const secondValue = Number(seconds);
  if (!Number.isFinite(minuteValue) || !Number.isFinite(secondValue) || secondValue >= 60) return null;
  const fractionValue = fraction ? Number((fraction + '000').slice(0, 3)) : 0;
  return minuteValue * 60000 + secondValue * 1000 + fractionValue;
}

function parseLrc(text, options = {}) {
  const source = typeof text === 'string' ? text.replace(/^\uFEFF/, '') : '';
  const metadata = { title: '', artist: '', album: '', offsetMs: 0 };
  const rawLines = [];

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const meta = LRC_META.exec(line);
    if (meta) {
      const key = meta[1].toLowerCase();
      const value = meta[2].trim();
      if (key === 'ti') metadata.title = cleanText(value);
      else if (key === 'ar') metadata.artist = cleanText(value);
      else if (key === 'al') metadata.album = cleanText(value);
      else if (key === 'offset' && /^[+-]?\d+$/.test(value)) metadata.offsetMs = Math.max(-60000, Math.min(60000, Number(value)));
      continue;
    }
    const stamps = [...line.matchAll(LRC_STAMP)];
    if (!stamps.length) continue;
    const lyric = line
      .replace(LRC_STAMP, '')
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '')
      .trim();
    if (!lyric) continue;
    for (const stamp of stamps) {
      const timeMs = timestampMs(stamp[1], stamp[2], stamp[3]);
      if (timeMs !== null) rawLines.push({ timeMs, text: lyric });
    }
  }

  // LRC's positive offset advances the lyric; player offsets use the reverse sign.
  const lines = rawLines
    .map((line) => ({ ...line, timeMs: Math.max(0, line.timeMs - metadata.offsetMs) }))
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, 5000);
  return { ...metadata, lines };
}

function plainToTimedLines(text, durationMs) {
  const limit = Number.isFinite(durationMs) && durationMs > 10000 ? durationMs : 240000;
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^\[(?:ar|ti|al|by|offset):.*\]$/i, '').trim())
    .filter(Boolean)
    .slice(0, 240);
  if (!lines.length) return [];
  const start = Math.min(8000, limit * 0.08);
  const end = Math.max(start + 1000, limit - Math.min(8000, limit * 0.08));
  const step = (end - start) / lines.length;
  return lines.map((line, index) => ({ timeMs: Math.round(start + step * index), text: line.slice(0, 300) }));
}

function lineAt(lines, positionMs) {
  if (!Array.isArray(lines) || !lines.length || !Number.isFinite(positionMs)) return null;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].timeMs <= positionMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found >= 0 ? { line: lines[found], index: found, next: lines[found + 1] || null } : { line: null, index: -1, next: lines[0] };
}

function normalizeMedia(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = cleanText(raw.title);
  if (!title) return null;
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return {
    title,
    artist: cleanText(raw.artist),
    album: cleanText(raw.album),
    playbackStatus: cleanText(raw.playbackStatus, 40),
    positionMs: Math.max(0, number(raw.positionMs)),
    startMs: Math.max(0, number(raw.startMs)),
    endMs: Math.max(0, number(raw.endMs)),
    lastUpdatedAt: Math.max(0, number(raw.lastUpdatedAt)),
    sourceApp: cleanText(raw.sourceApp, 300),
  };
}

function lyricPayload(value) {
  if (!value || !Array.isArray(value.lines) || !value.lines.length) return null;
  return {
    kind: value.kind,
    source: value.source,
    lines: value.lines
      .filter((line) => line && Number.isFinite(line.timeMs) && typeof line.text === 'string' && line.text.trim())
      .map((line) => ({ timeMs: Math.max(0, Math.round(line.timeMs)), text: cleanText(line.text) }))
      .slice(0, 5000),
  };
}

class WindowsMediaSource {
  constructor(options = {}) {
    this.script = options.script || path.join(__dirname, 'lyrics-media.ps1');
    this.spawnImpl = options.spawnImpl || spawn;
    this.logger = options.logger || console;
    this.onSnapshot = null;
    this.onError = null;
    this.child = null;
    this.running = false;
    this.retryTimer = null;
    this.buffer = '';
  }

  start(onSnapshot, onError = () => {}) {
    this.onSnapshot = onSnapshot;
    this.onError = onError;
    if (this.running) return;
    this.running = true;
    this.spawn();
  }

  spawn() {
    if (!this.running || this.child) return;
    let child;
    try {
      child = this.spawnImpl(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.script],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (error) {
      this.onError?.(error);
      this.scheduleRetry();
      return;
    }
    this.child = child;
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => this.consume(chunk));
    child.stderr?.on('data', () => {
      // PowerShell's error text is not exposed by the UI; the next state reports availability.
    });
    child.on('error', (error) => {
      this.onError?.(error);
      this.child = null;
      this.scheduleRetry();
    });
    child.on('exit', () => {
      this.child = null;
      if (this.running) this.scheduleRetry();
    });
  }

  consume(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 262144) this.buffer = this.buffer.slice(-65536);
    let newline;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line || !line.startsWith('{')) continue;
      try {
        const value = JSON.parse(line);
        Promise.resolve(this.onSnapshot?.(value)).catch(() => {});
      } catch {
        // Ignore partial or non-JSON output from Windows PowerShell.
      }
    }
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (!this.running) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.spawn();
    }, 5000);
    this.retryTimer.unref?.();
  }

  stop() {
    this.running = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.buffer = '';
    const child = this.child;
    this.child = null;
    if (child && !child.killed) {
      try {
        child.kill();
      } catch {
        // The process may already have exited.
      }
    }
  }
}

class LyricsService {
  constructor(options = {}) {
    this.dataDir = options.dataDir;
    this.fetchImpl = options.fetchImpl || global.fetch;
    this.now = options.now || Date.now;
    this.logger = options.logger || console;
    this.cacheDir = path.join(this.dataDir, 'lyrics');
    this.cacheFile = path.join(this.cacheDir, 'cache.json');
    this.localDir = path.join(this.cacheDir, 'local');
    this.localIndexFile = path.join(this.cacheDir, 'local-index.json');
    fs.mkdirSync(this.localDir, { recursive: true });
    this.cache = this.readJson(this.cacheFile, { version: 1, entries: {} });
    this.local = this.readJson(this.localIndexFile, { version: 1, entries: {} });
    this.config = { enabled: false, autoFetch: true };
    this.media = null;
    this.mediaId = '';
    this.lyrics = null;
    this.loadingKey = '';
    this.error = '';
    this.source = options.mediaSource === undefined
      ? process.platform === 'win32' ? new WindowsMediaSource({ logger: this.logger }) : null
      : options.mediaSource;
  }

  readJson(file, fallback) {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temporary, file);
  }

  configure(next = {}) {
    const wasEnabled = this.config.enabled;
    if (typeof next.enabled === 'boolean') this.config.enabled = next.enabled;
    if (typeof next.autoFetch === 'boolean') this.config.autoFetch = next.autoFetch;
    if (!this.config.enabled) {
      this.source?.stop();
      this.media = null;
      this.mediaId = '';
      this.lyrics = null;
      this.loadingKey = '';
      return;
    }
    if (!wasEnabled) {
      if (!this.source) {
        this.error = '当前系统不支持 Windows 媒体会话';
        return;
      }
      this.source.start(
        (value) => this.ingestMedia(value),
        (error) => {
          this.error = error?.message ? '媒体会话启动失败：' + cleanText(error.message) : '媒体会话启动失败';
        },
      );
    } else if (this.config.autoFetch && this.media && !this.lyrics && !this.loadingKey) {
      void this.fetchForCurrent();
    }
  }

  close() {
    this.source?.stop();
  }

  async ingestMedia(value) {
    const media = normalizeMedia(value?.media);
    if (!media) {
      this.media = null;
      this.mediaId = '';
      this.lyrics = null;
      this.loadingKey = '';
      this.error = cleanText(value?.error || '');
      return;
    }
    this.error = cleanText(value?.error || '');
    const key = mediaKey(media);
    const changed = key !== this.mediaId;
    this.media = media;
    if (changed) {
      this.mediaId = key;
      this.lyrics = this.loadForKey(key);
      this.loadingKey = '';
      if (!this.lyrics && this.config.enabled && this.config.autoFetch) return this.fetchForCurrent();
    }
  }

  loadForKey(key) {
    const local = this.local.entries?.[key];
    if (local?.file) {
      try {
        const text = fs.readFileSync(path.join(this.cacheDir, local.file), 'utf8');
        const parsed = parseLrc(text);
        const lines = parsed.lines.length ? parsed.lines : plainToTimedLines(text, this.media?.endMs);
        if (lines.length) return { ...lyricPayload({ kind: parsed.lines.length ? 'synced' : 'plain', source: 'local', lines }), fetchedAt: this.now() };
      } catch {
        // Fall through to the online cache.
      }
    }
    const entry = this.cache.entries?.[key];
    if (!entry || !Array.isArray(entry.lines) || !entry.lines.length) return null;
    return {
      kind: entry.kind === 'plain' ? 'plain' : 'synced',
      source: entry.source === 'local' ? 'local' : 'lrclib',
      lines: entry.lines,
      fetchedAt: entry.fetchedAt || 0,
    };
  }

  async fetchForCurrent() {
    if (!this.media || !this.config.enabled || !this.config.autoFetch) return;
    const media = { ...this.media };
    const key = mediaKey(media);
    this.loadingKey = key;
    this.error = '';
    try {
      const result = await this.lookupOnline(media);
      if (this.mediaId !== key) return;
      if (!result.lines.length) {
        this.lyrics = null;
        this.error = result.instrumental ? '当前歌曲为纯音乐，暂无歌词' : '未找到匹配歌词，可在设置中导入本地 LRC';
      } else {
        this.lyrics = result;
      }
      this.remember(key, result);
    } catch {
      if (this.mediaId === key) this.error = '歌词服务暂时不可用，可重试或导入本地 LRC';
    } finally {
      if (this.loadingKey === key) this.loadingKey = '';
    }
  }

  async lookupOnline(media) {
    if (typeof this.fetchImpl !== 'function') throw new Error('fetch unavailable');
    const headers = { Accept: 'application/json', 'User-Agent': USER_AGENT };
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(7000) : undefined;
    const duration = media.endMs > 0 ? (media.endMs - media.startMs) / 1000 : '';
    const params = new URLSearchParams({ track_name: media.title, artist_name: media.artist });
    if (media.album) params.set('album_name', media.album);
    if (Number.isFinite(duration) && duration > 0) params.set('duration', String(Math.round(duration)));
    const exact = await this.fetchImpl('https://lrclib.net/api/get?' + params, { headers, signal });
    let record = null;
    if (exact.ok) record = await exact.json();
    else if (exact.status !== 404) throw new Error('lyrics lookup failed');
    if (!record) {
      const searchParams = new URLSearchParams({ track_name: media.title });
      if (media.artist) searchParams.set('artist_name', media.artist);
      const response = await this.fetchImpl('https://lrclib.net/api/search?' + searchParams, { headers, signal });
      if (!response.ok) throw new Error('lyrics search failed');
      const values = await response.json();
      record = this.pickCandidate(Array.isArray(values) ? values : [], media);
    }
    return this.recordToLyrics(record, media);
  }

  pickCandidate(values, media) {
    const artist = normalizeToken(media.artist);
    const title = normalizeToken(media.title);
    const expected = media.endMs > media.startMs ? (media.endMs - media.startMs) / 1000 : 0;
    return values
      .filter((value) => value && typeof value === 'object')
      .map((value) => {
        let score = 0;
        if (normalizeToken(value.trackName) === title) score += 10;
        if (artist && normalizeToken(value.artistName) === artist) score += 8;
        if (value.syncedLyrics) score += 5;
        if (!value.instrumental) score += 1;
        const valueDuration = Number(value.duration);
        if (expected && Number.isFinite(valueDuration)) score -= Math.min(5, Math.abs(valueDuration - expected) / 10);
        return { value, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.value || null;
  }

  recordToLyrics(record, media) {
    if (!record) return { kind: 'missing', source: 'lrclib', lines: [], instrumental: false };
    if (record.instrumental) return { kind: 'instrumental', source: 'lrclib', lines: [], instrumental: true };
    const synced = parseLrc(record.syncedLyrics || '');
    if (synced.lines.length) {
      return { kind: 'synced', source: 'lrclib', lines: synced.lines, instrumental: false };
    }
    const plainLines = plainToTimedLines(record.plainLyrics || '', media.endMs || Number(record.duration) * 1000);
    return { kind: plainLines.length ? 'plain' : 'missing', source: 'lrclib', lines: plainLines, instrumental: false };
  }

  remember(key, result) {
    this.cache.entries ||= {};
    this.cache.entries[key] = {
      kind: result.kind,
      source: result.source,
      lines: result.lines.slice(0, 5000),
      fetchedAt: this.now(),
    };
    const entries = Object.entries(this.cache.entries).sort((a, b) => (b[1].fetchedAt || 0) - (a[1].fetchedAt || 0));
    this.cache.entries = Object.fromEntries(entries.slice(0, 200));
    try {
      this.writeJson(this.cacheFile, this.cache);
    } catch {
      // A read-only cache must not break lyric display.
    }
  }

  async useLocalFile(file) {
    if (!file || path.extname(file).toLowerCase() !== '.lrc') throw new Error('请选择 .lrc 歌词文件');
    if (!this.media) throw new Error('请先播放歌曲，再为当前歌曲导入 LRC');
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('LRC 文件无效或超过 1 MB');
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const parsed = parseLrc(text);
    const lines = parsed.lines.length ? parsed.lines : plainToTimedLines(text, this.media.endMs);
    if (!lines.length) throw new Error('LRC 中没有可显示的歌词');
    const key = this.mediaId;
    const relative = path.join('local', key + '.lrc');
    fs.copyFileSync(file, path.join(this.cacheDir, relative));
    this.local.entries ||= {};
    this.local.entries[key] = { file: relative, importedAt: this.now() };
    this.writeJson(this.localIndexFile, this.local);
    this.lyrics = {
      kind: parsed.lines.length ? 'synced' : 'plain',
      source: 'local',
      lines,
      fetchedAt: this.now(),
    };
    this.error = '';
    return this.status();
  }

  clearLocal() {
    if (!this.mediaId) return this.status();
    const entry = this.local.entries?.[this.mediaId];
    if (entry?.file) {
      try {
        fs.unlinkSync(path.join(this.cacheDir, entry.file));
      } catch {
        // The local file may already have been removed.
      }
    }
    if (this.local.entries) delete this.local.entries[this.mediaId];
    try {
      this.writeJson(this.localIndexFile, this.local);
    } catch {
      // Keep the in-memory state usable even if the cache cannot be updated.
    }
    this.lyrics = this.loadForKey(this.mediaId);
    if (!this.lyrics && this.config.autoFetch) void this.fetchForCurrent();
    return this.status();
  }

  async refresh() {
    if (!this.media) throw new Error('当前没有检测到歌曲');
    if (this.lyrics?.source === 'local') return this.status();
    this.lyrics = null;
    await this.fetchForCurrent();
    return this.status();
  }

  status(options = {}) {
    const base = { enabled: this.config.enabled, available: false, track: null, lyrics: null };
    if (!this.config.enabled) return { ...base, message: '歌词显示已关闭' };
    if (!this.media) return { ...base, message: this.error || '未检测到正在播放的歌曲' };

    const status = this.media.playbackStatus.toLowerCase();
    const elapsed = status === 'playing' && this.media.lastUpdatedAt > 0 ? Math.max(0, this.now() - this.media.lastUpdatedAt) : 0;
    const userOffset = Number(options.offsetMs);
    const offsetMs = Number.isFinite(userOffset) ? Math.max(-30000, Math.min(30000, userOffset)) : 0;
    const positionMs = Math.max(0, this.media.positionMs + elapsed - offsetMs);
    const found = lineAt(this.lyrics?.lines, positionMs);
    const durationMs = Math.max(0, this.media.endMs - this.media.startMs);
    return {
      enabled: true,
      available: true,
      playbackStatus: this.media.playbackStatus,
      positionMs: Math.round(positionMs),
      durationMs: Math.round(durationMs),
      progress: durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0,
      title: this.media.title,
      artist: this.media.artist,
      album: this.media.album,
      sourceApp: this.media.sourceApp,
      lyrics: this.lyrics
        ? { kind: this.lyrics.kind, source: this.lyrics.source, lineCount: this.lyrics.lines.length }
        : null,
      current: found?.line ? { text: found.line.text, timeMs: found.line.timeMs } : null,
      next: found?.next ? { text: found.next.text, timeMs: found.next.timeMs } : null,
      loading: this.loadingKey === this.mediaId,
      message: this.lyrics ? '' : this.error || (this.loadingKey === this.mediaId ? '正在匹配歌词…' : '暂无歌词'),
    };
  }
}

module.exports = {
  LyricsService,
  WindowsMediaSource,
  lineAt,
  mediaKey,
  normalizeMedia,
  parseLrc,
  plainToTimedLines,
};
