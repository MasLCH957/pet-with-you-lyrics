const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async function verifyLyrics({ service, pet, directory }) {
  service.lyrics.configure({ enabled: true, autoFetch: false });
  service.lyrics.source?.stop();
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
  const state = await pet.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.pet-lyrics');return {visible:card.classList.contains('is-on'),title:document.querySelector('.pet-lyrics-title').textContent,current:document.querySelector('.pet-lyrics-current').textContent,next:document.querySelector('.pet-lyrics-next').textContent,nonInteractive:getComputedStyle(card).pointerEvents==='none'};})()`);
  assert.deepEqual(state, {
    visible: true,
    title: '歌词界面测试 · pet-with-you',
    current: '第二句测试歌词',
    next: '第三句测试歌词',
    nonInteractive: true,
  });
  const image = await pet.webContents.capturePage();
  assert.equal(image.isEmpty(), false);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'lyrics-overlay.png'), image.toPNG());
};
