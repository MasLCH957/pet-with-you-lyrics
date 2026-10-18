(() => {
  const quotaSection = document.querySelector('#quotaSection');
  if (!quotaSection || document.querySelector('#lyricsSection')) return;

  quotaSection.insertAdjacentHTML(
    'beforebegin',
    `<section data-module="" id="lyricsSection">
      <div class="module-heading"><h2>歌词显示</h2><button aria-label="拖动排序：歌词显示" class="module-handle" draggable="false" title="拖动调整顺序；聚焦后可用上下方向键移动" type="button">拖动排序</button></div>
      <p class="hint">通过 Windows 系统媒体会话读取当前歌曲与播放进度，不绑定 QQ 音乐、网易云或 Spotify 等单一平台。歌词卡片显示在桌宠下方，不占用任务、碎碎念和额度气泡的位置。</p>
      <label><input checked id="lyricsEnabled" type="checkbox"/>在桌宠下方显示歌词</label>
      <label><input checked id="lyricsAutoFetch" type="checkbox"/>自动匹配在线同步歌词（LRCLIB / QQ 音乐）</label>
      <label><input checked id="lyricsSimplifiedChinese" type="checkbox"/>歌词自动转换为简体中文</label>
      <p class="hint">自动匹配优先使用 LRCLIB，未收录时会尝试 QQ 音乐；只发送歌曲名、歌手、专辑和时长，不发送播放器账号、登录信息或本地文件。仍找不到歌词或无法联网时，可为正在播放的歌曲导入本地 .lrc。</p>
      <label>同步微调（毫秒）<input id="lyricsOffsetMs" max="30000" min="-30000" step="50" type="number" value="0"/></label>
      <p class="hint">正数让歌词延后出现，负数让歌词提前出现。关闭设置时会自动保存并应用。</p>
      <div class="api-actions">
        <button id="chooseLyricsFile" type="button">为当前歌曲导入 LRC</button>
        <button id="clearLyricsFile" type="button">清除当前歌曲的本地歌词</button>
        <button id="refreshLyrics" type="button">重新匹配歌词</button>
      </div>
      <div class="profile-summary" id="lyricsPreview" aria-live="polite">正在读取媒体会话…</div>
      <span id="lyricsResult" role="status"></span>
    </section>`,
  );

  const enabled = document.querySelector('#lyricsEnabled');
  const autoFetch = document.querySelector('#lyricsAutoFetch');
  const simplifiedChinese = document.querySelector('#lyricsSimplifiedChinese');
  const offset = document.querySelector('#lyricsOffsetMs');
  const preview = document.querySelector('#lyricsPreview');
  const result = document.querySelector('#lyricsResult');
  const buttons = ['chooseLyricsFile', 'clearLyricsFile', 'refreshLyrics'].map((id) => document.querySelector('#' + id));
  let polling = false;

  api('/preferences')
    .then((value) => {
      enabled.checked = value.lyricsEnabled !== false;
      autoFetch.checked = value.lyricsAutoFetch !== false;
      simplifiedChinese.checked = value.lyricsSimplifiedChinese !== false;
      offset.value = String(Number.isFinite(value.lyricsOffsetMs) ? value.lyricsOffsetMs : 0);
    })
    .catch((error) => {
      result.textContent = '读取歌词设置失败：' + error.message;
    });

  function describe(state) {
    if (!state?.enabled) return state?.message || '歌词显示已关闭。';
    if (!state.available) return state.message || '未检测到正在播放的歌曲。';
    const track = [state.title, state.artist].filter(Boolean).join(' · ');
    const source = state.lyrics ? ({local:'本地 LRC',lrclib:'LRCLIB',qqmusic:'QQ 音乐'}[state.lyrics.source] || '在线歌词') : '';
    const current = state.current?.text || state.next?.text || state.message || '暂无歌词';
    return `${track}\n${current}${source ? '\n歌词来源：' + source : ''}`;
  }

  async function refreshStatus() {
    if (polling) return;
    polling = true;
    try {
      const state = await api('/lyrics/status');
      preview.textContent = describe(state);
    } catch (error) {
      preview.textContent = '读取播放状态失败：' + error.message;
    } finally {
      polling = false;
    }
  }

  async function runAction(button, operation, successText) {
    buttons.forEach((item) => {
      item.disabled = true;
    });
    result.textContent = '正在处理…';
    try {
      const value = await operation();
      if (value?.canceled) {
        result.textContent = '已取消。';
      } else {
        result.textContent = successText;
        preview.textContent = describe(value);
      }
      await refreshStatus();
    } catch (error) {
      result.textContent = '操作失败：' + error.message;
    } finally {
      buttons.forEach((item) => {
        item.disabled = false;
      });
    }
  }

  document.querySelector('#chooseLyricsFile').onclick = () =>
    runAction(buttons[0], () => api('/lyrics/local/choose', 'POST'), '已为当前歌曲保存本地 LRC，并优先于在线歌词。');
  document.querySelector('#clearLyricsFile').onclick = () =>
    runAction(buttons[1], () => api('/lyrics/local/clear', 'POST'), '已清除当前歌曲的本地歌词覆盖。');
  document.querySelector('#refreshLyrics').onclick = () =>
    runAction(buttons[2], () => api('/lyrics/refresh', 'POST'), '已重新获取在线歌词。');

  void refreshStatus();
  setInterval(() => {
    if (!document.hidden) void refreshStatus();
  }, 2000);
})();
