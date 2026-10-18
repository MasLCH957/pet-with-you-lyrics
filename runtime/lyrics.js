/**
 * Desktop lyrics overlay.
 *
 * Windows media-session reading and lyric matching live in the main process.
 * This renderer only polls the already-sanitized display state and updates a
 * non-interactive card below the pet. Keeping it outside the existing bubble
 * priority rules means task feedback, whispers and quota cards keep their
 * established behavior.
 */
'use strict';

let activeLyricsOverlay = null;

class LyricsOverlay {
  constructor(sprite) {
    this.sprite = sprite;
    this.closed = false;
    this.timer = null;
    this.lastSignature = '';
    this.el = document.createElement('div');
    this.el.className = 'pet-lyrics';
    this.el.hidden = true;

    this.head = document.createElement('div');
    this.head.className = 'pet-lyrics-head';
    this.title = document.createElement('span');
    this.title.className = 'pet-lyrics-title';
    this.head.append(this.title);

    this.current = document.createElement('div');
    this.current.className = 'pet-lyrics-current';
    this.next = document.createElement('div');
    this.next.className = 'pet-lyrics-next';
    this.progress = document.createElement('div');
    this.progress.className = 'pet-lyrics-progress';
    this.progressFill = document.createElement('span');
    this.progress.append(this.progressFill);

    this.el.append(this.head, this.current, this.next, this.progress);
    sprite.stage.append(this.el);
  }

  start() {
    void this.tick();
  }

  async tick() {
    if (this.closed) return;
    try {
      if (window.petPreferences?.lyricsEnabled === false) {
        this.hide();
      } else {
        const response = await fetch(BASE + '/lyrics/status', { cache: 'no-store' });
        if (!response.ok) throw new Error('lyrics status ' + response.status);
        this.render(await response.json());
      }
    } catch {
      this.hide();
    } finally {
      if (!this.closed) this.timer = window.setTimeout(() => void this.tick(), 500);
    }
  }

  render(state) {
    if (!state || !state.enabled || !state.available || !state.title) {
      this.hide();
      return;
    }
    const current = state.current?.text || (state.next?.text ? state.next.text : '');
    const next = state.current ? state.next?.text || '' : '';
    const message = state.loading ? '正在匹配歌词…' : state.message || '暂无歌词';
    const shown = current || message;
    const signature = JSON.stringify([
      state.title,
      state.artist,
      state.playbackStatus,
      shown,
      next,
      Math.round((state.progress || 0) * 1000),
      state.loading,
    ]);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.el.hidden = false;
    this.el.classList.add('is-on');
    this.el.classList.toggle('is-paused', String(state.playbackStatus).toLowerCase() !== 'playing');
    this.el.classList.toggle('is-empty', !current);
    this.title.textContent = state.artist ? state.title + ' · ' + state.artist : state.title;
    this.title.title = state.album ? state.title + ' · ' + state.artist + ' · ' + state.album : this.title.textContent;
    this.current.textContent = shown;
    this.current.title = shown;
    this.next.textContent = next;
    this.next.title = next;
    this.progressFill.style.setProperty('--lyrics-progress', Math.round(Math.max(0, Math.min(1, state.progress || 0)) * 100) + '%');
    window.__dshPetDebug.lyrics = {
      title: state.title,
      artist: state.artist,
      current: state.current?.text || '',
      source: state.lyrics?.source || '',
      kind: state.lyrics?.kind || '',
    };
  }

  hide() {
    this.lastSignature = '';
    this.el.classList.remove('is-on', 'is-paused', 'is-empty');
    this.el.hidden = true;
    if (window.__dshPetDebug) delete window.__dshPetDebug.lyrics;
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.el.remove();
  }
}

function startLyricsOverlay() {
  activeLyricsOverlay?.close();
  activeLyricsOverlay = null;
  const sprite = sprites[0];
  if (!sprite?.stage) return;
  activeLyricsOverlay = new LyricsOverlay(sprite);
  activeLyricsOverlay.start();
}
