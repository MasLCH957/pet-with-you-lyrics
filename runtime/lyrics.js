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
    this.layoutFrame = null;
    this.lastSignature = '';
    this.controlBusy = false;
    this.noticeText = '';
    this.noticeUntil = 0;
    this.el = document.createElement('div');
    this.el.className = 'pet-lyrics';
    this.el.hidden = true;

    this.head = document.createElement('div');
    this.head.className = 'pet-lyrics-head';
    this.title = document.createElement('span');
    this.title.className = 'pet-lyrics-title';
    this.head.append(this.title);

    this.controls = document.createElement('div');
    this.controls.className = 'pet-lyrics-controls';
    this.previous = this.createControl(
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h2.4v14H7zm11.8 0v14L9.4 12z"/></svg>',
      '上一首',
      'previous',
    );
    this.play = this.createControl(
      '<svg class="pet-lyrics-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4.5" height="16" rx="1.2"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.2"/></svg>' +
        '<svg class="pet-lyrics-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.1-6.8c.6-.4.6-1.4 0-1.8L9.6 4.3C8.9 3.9 8 4.4 8 5.2z"/></svg>',
      '播放 / 暂停',
      'toggle',
    );
    this.play.classList.add('is-play-toggle');
    this.nextControl = this.createControl(
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5h2.4v14H15zM5.2 5v14L14.6 12z"/></svg>',
      '下一首',
      'next',
    );
    this.controls.append(this.previous, this.play, this.nextControl);

    this.current = document.createElement('div');
    this.current.className = 'pet-lyrics-current';
    this.next = document.createElement('div');
    this.next.className = 'pet-lyrics-next';
    this.progress = document.createElement('div');
    this.progress.className = 'pet-lyrics-progress';
    this.progressFill = document.createElement('span');
    this.progress.append(this.progressFill);

    this.el.append(this.head, this.controls, this.current, this.next, this.progress);
    sprite.stage.append(this.el);
  }

  createControl(text, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pet-lyrics-control';
    button.innerHTML = text;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('contextmenu', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.control(action);
    });
    return button;
  }

  async control(action) {
    if (this.controlBusy) return;
    this.controlBusy = true;
    this.setControlsDisabled(true);
    const labels = { previous: '正在切换到上一首…', next: '正在切换到下一首…', toggle: '正在切换播放状态…' };
    this.current.textContent = labels[action] || '正在控制播放器…';
    this.current.classList.add('is-control-message');
    try {
      await controlLyricsMedia(action);
    } catch (error) {
      this.noticeText = '音乐控制失败：' + (error?.message || '未知错误');
      this.noticeUntil = Date.now() + 3500;
      this.current.textContent = this.noticeText;
    } finally {
      this.controlBusy = false;
      this.setControlsDisabled(false);
      this.lastSignature = '';
      this.queueLayout();
    }
  }

  setControlsDisabled(disabled) {
    for (const button of [this.previous, this.play, this.nextControl]) button.disabled = disabled;
  }

  queueLayout() {
    if (this.layoutFrame !== null || this.closed) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.layout();
    });
  }

  layout() {
    if (this.closed || this.el.hidden || !this.el.classList.contains('is-on')) {
      this.sprite.setLyricsControlRect(null);
      return;
    }
    const stage = this.sprite.stage.getBoundingClientRect();
    const bounds = this.sprite.visibleClampRect?.() || { x: 0, y: 0, w: innerWidth, h: innerHeight };
    const before = this.el.getBoundingClientRect();
    const bottomSpace = bounds.y + bounds.h - (stage.top + stage.height) - 8;
    const topSpace = stage.top - bounds.y - 8;
    const shouldAbove = bottomSpace < before.height + 2 && topSpace > bottomSpace;
    if (shouldAbove !== this.el.classList.contains('is-above')) {
      this.el.classList.toggle('is-above', shouldAbove);
      this.queueLayout();
      return;
    }
    this.el.style.translate = '0px 0px';
    const rect = this.el.getBoundingClientRect();
    const result = window.PetSnap.clampRect({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h },
      margin: 4,
    });
    this.el.style.translate = result.dx + 'px ' + result.dy + 'px';
    const control = this.controls.getBoundingClientRect();
    this.sprite.setLyricsControlRect({
      x: control.left,
      y: control.top,
      width: control.width,
      height: control.height,
    });
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
    this.queueLayout();
    const current = state.current?.text || (state.next?.text ? state.next.text : '');
    const next = state.current ? state.next?.text || '' : '';
    const message = state.loading ? '正在匹配歌词…' : state.message || '暂无歌词';
    const notice = this.noticeText && Date.now() < this.noticeUntil ? this.noticeText : '';
    const shown = notice || current || message;
    const signature = JSON.stringify([
      state.title,
      state.artist,
      state.playbackStatus,
      shown,
      next,
      Math.round((state.progress || 0) * 1000),
      state.loading,
      notice,
    ]);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.el.hidden = false;
    this.el.classList.add('is-on');
    this.el.classList.toggle('is-paused', String(state.playbackStatus).toLowerCase() !== 'playing');
    this.el.classList.toggle('is-empty', !current);
    this.current.classList.remove('is-control-message');
    this.play.title = this.play.getAttribute('aria-label') + (String(state.playbackStatus).toLowerCase() === 'playing' ? '（暂停）' : '（播放）');
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
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
    this.lastSignature = '';
    this.el.classList.remove('is-on', 'is-paused', 'is-empty', 'is-above');
    this.el.style.translate = '0px 0px';
    this.el.hidden = true;
    this.sprite.setLyricsControlRect(null);
    if (window.__dshPetDebug) delete window.__dshPetDebug.lyrics;
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.layoutFrame);
    this.sprite.setLyricsControlRect(null);
    this.el.remove();
  }
}

async function controlLyricsMedia(action) {
  const response = await fetch(BASE + '/lyrics/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok || !value.ok) throw new Error(value.message || '播放器没有接受该操作');
  return value;
}

function startLyricsOverlay() {
  activeLyricsOverlay?.close();
  activeLyricsOverlay = null;
  const sprite = sprites[0];
  if (!sprite?.stage) return;
  activeLyricsOverlay = new LyricsOverlay(sprite);
  activeLyricsOverlay.start();
}

window.addEventListener('resize', () => activeLyricsOverlay?.queueLayout(), { passive: true });
