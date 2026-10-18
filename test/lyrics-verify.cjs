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
  fs.writeFileSync(lrc, '[00:01.00]第一句測試歌詞\n[00:03.00]第二句測試歌詞\n[00:06.00]第三句測試歌詞', 'utf8');
  await service.lyrics.useLocalFile(lrc);

  for (let index = 0; index < 20; index++) {
    const ready = await pet.webContents.executeJavaScript(
      `document.querySelector('.pet-lyrics')?.classList.contains('is-on') && document.querySelector('.pet-lyrics-current')?.textContent.includes('第二句测试')`,
    );
    if (ready) break;
    await sleep(100);
  }
  const state = await pet.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.pet-lyrics'),buttons=[...document.querySelectorAll('.pet-lyrics-control')];return {visible:card.classList.contains('is-on'),title:document.querySelector('.pet-lyrics-title').textContent,current:document.querySelector('.pet-lyrics-current').textContent,next:document.querySelector('.pet-lyrics-next').textContent,nonInteractive:getComputedStyle(card).pointerEvents==='none',controls:buttons.length,controlsInteractive:buttons.every(button=>getComputedStyle(button).pointerEvents==='auto'),controlRect:!!sprites[0].lyricsControlRect,playWidth:Math.round(document.querySelector('.is-play-toggle').getBoundingClientRect().width)};})()`);
  assert.deepEqual(state, {
    visible: true,
    title: '歌词界面测试 · pet-with-you',
    current: '第二句测试歌词',
    next: '第三句测试歌词',
    nonInteractive: true,
    controls: 3,
    controlsInteractive: true,
    controlRect: true,
    playWidth: 34,
  });
  pet.focus();
  pet.webContents.focus();
  await sleep(250);
  const point = await pet.webContents.executeJavaScript(`(()=>{const r=document.querySelector('[aria-label="下一首"]').getBoundingClientRect(),x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);return {x:Math.round(x*CONFIG.scale),y:Math.round(y*CONFIG.scale),clientX:x,clientY:y};})()`);
  await sleep(60);
  await pet.webContents.executeJavaScript(`window.__lyricsPointerProbe=null;window.addEventListener('mousemove',event=>{window.__lyricsPointerProbe={x:event.clientX,y:event.clientY}},{once:true})`);
  pet.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
  await sleep(80);
  const currentPoint = await pet.webContents.executeJavaScript(`(()=>{const r=document.querySelector('[aria-label="下一首"]').getBoundingClientRect(),x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);return {x:Math.round(x*CONFIG.scale),y:Math.round(y*CONFIG.scale),clientX:x,clientY:y};})()`);
  pet.webContents.sendInputEvent({ type: 'mouseMove', x: currentPoint.x, y: currentPoint.y });
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

  try {
    const clipped = await pet.webContents.executeJavaScript(`(async()=>{
      const s=sprites[0],area=AREAS[0];
      window.__lyricsClipRestore={pos:{x:s.pos.x,y:s.pos.y},prefs:{...window.petPreferences},attachment:s.snapAttachment};
      window.petPreferences={...window.petPreferences,snapMode:'none'};s.snapAttachment=null;
      s.sendBounds(area.x+area.width-s.size-2,area.y+area.height-s.height-2);
      activeLyricsOverlay.queueLayout();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const bounds=s.visibleClampRect(),card=document.querySelector('.pet-lyrics').getBoundingClientRect();
      return {
        above:document.querySelector('.pet-lyrics').classList.contains('is-above'),
        inside:card.left>=bounds.x+3&&card.right<=bounds.x+bounds.w-3&&card.top>=bounds.y+3&&card.bottom<=bounds.y+bounds.h-3,
        bounds,
        card:{x:card.x,y:card.y,width:card.width,height:card.height},
      };
    })()`);
    assert.equal(clipped.inside, true, JSON.stringify(clipped));
    assert.equal(clipped.above, true, JSON.stringify(clipped));
    const clampedImage = await pet.webContents.capturePage();
    assert.equal(clampedImage.isEmpty(), false);
    fs.writeFileSync(path.join(directory, 'lyrics-overlay-clamped.png'), clampedImage.toPNG());
  } finally {
    await pet.webContents.executeJavaScript(`(()=>{const s=sprites[0],saved=window.__lyricsClipRestore;if(saved){window.petPreferences=saved.prefs;s.snapAttachment=saved.attachment;s.sendBounds(saved.pos.x,saved.pos.y);activeLyricsOverlay.queueLayout();delete window.__lyricsClipRestore;}})()`);
  }
};
