const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LyricsService, lineAt, parseLrc, plainToTimedLines } = require('../lyrics.cjs');

test('LRC parser handles metadata, fractions, offset and multiple timestamps', () => {
  const parsed = parseLrc([
    '\uFEFF[ti:测试歌曲]',
    '[ar:测试歌手]',
    '[al:测试专辑]',
    '[offset:+100]',
    '[00:01.50]第一句',
    '[00:03.00][00:05.25]重复句 <00:03.50>高亮',
    'plain text without timestamps',
  ].join('\n'));
  assert.equal(parsed.title, '测试歌曲');
  assert.equal(parsed.artist, '测试歌手');
  assert.equal(parsed.album, '测试专辑');
  assert.deepEqual(parsed.lines, [
    { timeMs: 1400, text: '第一句' },
    { timeMs: 2900, text: '重复句 高亮' },
    { timeMs: 5150, text: '重复句 高亮' },
  ]);
  assert.deepEqual(lineAt(parsed.lines, 3000), {
    line: { timeMs: 2900, text: '重复句 高亮' },
    index: 1,
    next: { timeMs: 5150, text: '重复句 高亮' },
  });
});

test('plain lyrics receive a bounded fallback timeline', () => {
  const lines = plainToTimedLines('[ar:测试]\n第一行\n第二行\n第三行', 200000);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].timeMs >= 8000);
  assert.ok(lines.at(-1).timeMs < 200000);
  assert.ok(lines[0].timeMs < lines[1].timeMs);
  assert.ok(lines[1].timeMs < lines[2].timeMs);
});

test('lyrics service matches online lyrics and follows playback time', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-lyrics-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  class FakeMediaSource {
    start(callback) {
      this.emit = callback;
    }
    stop() {}
  }
  const source = new FakeMediaSource();
  let now = 10000;
  const calls = [];
  const syncedLyrics = '[00:01.50]第一句\n[00:03.00]第二句\n[00:05.00]第三句';
  const service = new LyricsService({
    dataDir: directory,
    mediaSource: source,
    now: () => now,
    fetchImpl: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          trackName: '测试歌曲',
          artistName: '测试歌手',
          duration: 20,
          syncedLyrics,
          plainLyrics: null,
          instrumental: false,
        }),
      };
    },
  });
  service.configure({ enabled: true, autoFetch: true });
  await source.emit({
    media: {
      title: '测试歌曲',
      artist: '测试歌手',
      album: '测试专辑',
      playbackStatus: 'Playing',
      positionMs: 1000,
      endMs: 20000,
      lastUpdatedAt: 9000,
    },
  });
  const state = service.status();
  assert.equal(state.available, true);
  assert.equal(state.lyrics.source, 'lrclib');
  assert.equal(state.lyrics.kind, 'synced');
  assert.equal(state.current.text, '第一句');
  assert.equal(state.next.text, '第二句');
  assert.equal(calls.length, 1);

  now = 13000;
  const paused = service.status();
  assert.equal(paused.current.text, '第三句');
  service.close();
});

test('local LRC overrides online lyrics for the current song', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-lyrics-local-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  class FakeMediaSource {
    start(callback) {
      this.emit = callback;
    }
    stop() {}
  }
  const source = new FakeMediaSource();
  const service = new LyricsService({
    dataDir: directory,
    mediaSource: source,
    now: () => 5000,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ trackName: '本地测试', artistName: '歌手', duration: 20, syncedLyrics: '[00:01.00]在线', instrumental: false }),
    }),
  });
  service.configure({ enabled: true, autoFetch: false });
  await source.emit({
    media: {
      title: '本地测试',
      artist: '歌手',
      playbackStatus: 'Paused',
      positionMs: 1000,
      endMs: 20000,
    },
  });
  const file = path.join(directory, 'current.lrc');
  fs.writeFileSync(file, '[00:00.50]本地第一句\n[00:03.00]本地第二句', 'utf8');
  const state = await service.useLocalFile(file);
  assert.equal(state.lyrics.source, 'local');
  assert.equal(state.current.text, '本地第一句');
  const cleared = service.clearLocal();
  assert.equal(cleared.lyrics, null);
  service.close();
});

test('late lyric responses cannot overwrite a newer song', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-lyrics-race-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  class FakeMediaSource {
    start(callback) {
      this.emit = callback;
    }
    stop() {}
  }
  const source = new FakeMediaSource();
  let releaseFirst;
  const firstResponse = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const service = new LyricsService({
    dataDir: directory,
    mediaSource: source,
    now: () => 1000,
    fetchImpl: async (url) => {
      const track = new URL(url).searchParams.get('track_name');
      if (track === '旧歌曲') await firstResponse;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          trackName: track,
          artistName: '歌手',
          duration: 20,
          syncedLyrics: track === '旧歌曲' ? '[00:00.00]旧歌词' : '[00:00.00]新歌词',
          instrumental: false,
        }),
      };
    },
  });
  service.configure({ enabled: true, autoFetch: true });
  const oldLookup = source.emit({
    media: { title: '旧歌曲', artist: '歌手', playbackStatus: 'Playing', positionMs: 0, endMs: 20000, lastUpdatedAt: 1000 },
  });
  await source.emit({
    media: { title: '新歌曲', artist: '歌手', playbackStatus: 'Playing', positionMs: 0, endMs: 20000, lastUpdatedAt: 1000 },
  });
  releaseFirst();
  await oldLookup;
  assert.equal(service.status().title, '新歌曲');
  assert.equal(service.status().current.text, '新歌词');
  service.close();
});

test('lyric network failures keep media state usable', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-lyrics-offline-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  class FakeMediaSource {
    start(callback) {
      this.emit = callback;
    }
    stop() {}
  }
  const source = new FakeMediaSource();
  const service = new LyricsService({
    dataDir: directory,
    mediaSource: source,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  service.configure({ enabled: true, autoFetch: true });
  await source.emit({
    media: { title: '离线歌曲', artist: '歌手', playbackStatus: 'Paused', positionMs: 0, endMs: 20000 },
  });
  const state = service.status();
  assert.equal(state.available, true);
  assert.equal(state.title, '离线歌曲');
  assert.match(state.message, /歌词服务暂时不可用/);
  service.close();
});

test('disabling lyrics stops the media source and clears display state', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-lyrics-disable-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  class FakeMediaSource {
    constructor() {
      this.stops = 0;
    }
    start(callback) {
      this.emit = callback;
    }
    stop() {
      this.stops++;
    }
  }
  const source = new FakeMediaSource();
  const service = new LyricsService({ dataDir: directory, mediaSource: source });
  service.configure({ enabled: true, autoFetch: false });
  await source.emit({
    media: { title: '关闭测试', artist: '歌手', playbackStatus: 'Playing', positionMs: 0, endMs: 20000 },
  });
  service.configure({ enabled: false });
  assert.equal(source.stops, 1);
  assert.deepEqual(service.status(), {
    enabled: false,
    available: false,
    track: null,
    lyrics: null,
    message: '歌词显示已关闭',
  });
  service.close();
});

test('a partial media snapshot retries when duration becomes available', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-lyrics-partial-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  class FakeMediaSource {
    start(callback) {
      this.emit = callback;
    }
    stop() {}
  }
  const source = new FakeMediaSource();
  let lookups = 0;
  const service = new LyricsService({
    dataDir: directory,
    mediaSource: source,
    now: () => 1000,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/api/get')) {
        lookups++;
        if (!parsed.searchParams.get('duration')) return { ok: false, status: 400, json: async () => ({}) };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            trackName: '完整歌曲',
            artistName: '歌手',
            duration: 20,
            syncedLyrics: '[00:00.00]延迟读取到的歌词',
            instrumental: false,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    },
  });
  service.configure({ enabled: true, autoFetch: true });
  const media = { title: '完整歌曲', artist: '歌手', album: '专辑', playbackStatus: 'Playing', positionMs: 0, lastUpdatedAt: 1000 };
  await source.emit({ media: { ...media, endMs: 0 } });
  assert.equal(service.status().lyrics, null);
  await source.emit({ media: { ...media, endMs: 20000 } });
  assert.equal(lookups, 2);
  assert.equal(service.status().current.text, '延迟读取到的歌词');
  service.close();
});
