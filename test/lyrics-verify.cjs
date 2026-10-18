const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async function verifyLyrics({ service, pet, directory }) {
  service.lyrics.configure({ enabled: true, autoFetch: false });
  service.lyrics.source?.stop();
  const actions = [];
  service.lyrics.source.control = async (action) => {
    actions.push(action);
    return { ok: true, action, playbackStatus: 'Playing' };
  };
  await service.lyrics.ingestMedia({
    media: {
      title: '歌词界面测试',
      artist: 'pet-with-you',
      album: 'UI fixture',
      playbackStatus: 'Playing',
      positionMs: 3500,
      startMs: 0,
      endMs: 12000,
      lastUpdatedAt: Date.now(),
    },
  });
  const lrc = path.join(path.dirname(service.paths.settings.file), 'lyrics-fixture.lrc');
  fs.writeFileSync(lrc, '[00:01.00]第一句测试歌词\n[00:03.00]第二句测试歌词\n[00:06.00]第三句测试歌词', 'utf8');
  await service.lyrics.useLocalFile(lrc);

  for (let index = 0; index < 20; index++) {
    const ready = await pet.webContents.executeJavaScript(
      `document.querySelector('.pet-lyrics')?.classList.contains('is-on') && document.querySelector('.pet-lyrics-current')?.textContent.includes('第二句')`,
    );
    if (ready) break;
    await sleep(100);
  }
  const state = await pet.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.pet-lyrics'),buttons=[...document.querySelectorAll('.pet-lyrics-control')];return {visible:card.classList.contains('is-on'),title:document.querySelector('.pet-lyrics-title').textContent,current:document.querySelector('.pet-lyrics-current').textContent,next:document.querySelector('.pet-lyrics-next').textContent,nonInteractive:getComputedStyle(card).pointerEvents==='none',controls:buttons.length,controlsInteractive:buttons.every(button=>getComputedStyle(button).pointerEvents==='auto'),controlRect:!!sprites[0].lyricsControlRect};})()`);
  assert.deepEqual(state, {
    visible: true,
    title: '歌词界面测试 · pet-with-you',
    current: '第二句测试歌词',
    next: '第三句测试歌词',
    nonInteractive: true,
    controls: 3,
    controlsInteractive: true,
    controlRect: true,
  });
  const point = await pet.webContents.executeJavaScript(`(()=>{const r=document.querySelector('[aria-label="下一首"]').getBoundingClientRect(),x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);return {x:Math.round(x*CONFIG.scale),y:Math.round(y*CONFIG.scale),clientX:x,clientY:y};})()`);
  pet.focus();
  pet.webContents.focus();
  await sleep(100);
  await pet.webContents.executeJavaScript(`window.__lyricsPointerProbe=null;window.addEventListener('mousemove',event=>{window.__lyricsPointerProbe={x:event.clientX,y:event.clientY}},{once:true})`);
  pet.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
  await sleep(200);
  const pointerState = await pet.webContents.executeJavaScript(`({interactive:sprites[0]._interactive,lyricsHover:sprites[0].lyricsHover,inputBusy:sprites[0]._inputBusy})`);
  const pointerDebug = await pet.webContents.executeJavaScript(`({point:${JSON.stringify(point)},rect:sprites[0].lyricsControlRect,event:window.__lyricsPointerProbe})`);
  assert.deepEqual(pointerState, {
    interactive: true,
    lyricsHover: true,
    inputBusy: true,
  }, JSON.stringify(pointerDebug));
  pet.webContents.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  pet.webContents.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  for (let index = 0; index < 20 && !actions.length; index++) await sleep(50);
  assert.deepEqual(actions, ['next']);
  const image = await pet.webContents.capturePage();
  assert.equal(image.isEmpty(), false);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'lyrics-overlay.png'), image.toPNG());
};
