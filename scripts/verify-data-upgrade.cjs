// Production-path migration checks belong only in a disposable GitHub Windows runner.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI !== 'true') throw new Error('Use a disposable GitHub Windows runner; never run this against personal AppData.');
const [phase, executable, fixture] = process.argv.slice(2);
assert.ok(['seed', 'verify', 'cleanup'].includes(phase));
// PowerShell can supply an 8.3 alias while Node returns the expanded temp path.
assert.ok(fixture && fs.realpathSync.native(fixture).toLowerCase().startsWith(fs.realpathSync.native(os.tmpdir()).toLowerCase().replace(/[\\/]+$/, '') + path.sep));
const stateFile = path.join(fixture, 'data-upgrade-fixture.json');
const legacyDir = path.join(process.env.APPDATA, 'DSH Pet Companion');
const newDir = path.join(process.env.APPDATA, 'pet-with-you');
const stableSource = phase==='seed'
  ? Number(require(path.join(path.dirname(executable),'resources','app','package.json')).version.split('.')[0])>=1
  : fs.existsSync(stateFile)&&JSON.parse(fs.readFileSync(stateFile,'utf8')).stableSource===true;
const oldDir = stableSource ? newDir : legacyDir;
const marker = '.pet-upgrade-test';
const startup = path.join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup');
const newLink = path.join(startup, 'pet-with-you.lnk');
const oldLink = stableSource ? newLink : path.join(startup, 'DSH Pet Companion.lnk');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(PET_|DSH_PET_)/.test(key) || ['ELECTRON_RUN_AS_NODE', 'OPENAI_API_KEY', 'CODEX_API_KEY'].includes(key)) delete env[key];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let child, closed, mock, inspectorUrl;
async function stop() {
  if (!child) return;
  if (child.exitCode === null && inspectorUrl) {
    // A forced kill can discard Chromium's pending encryption-key write. Match tray Quit.
    const socket = new WebSocket(inspectorUrl);
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Fixture quit inspector timeout')), 5000);
        socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "setTimeout(() => process.mainModule.require('electron').app.quit(), 100)" } }));
        socket.onmessage = event => { const result = JSON.parse(event.data); if (result.id === 1) { clearTimeout(timeout); result.error || result.result?.exceptionDetails ? reject(new Error('Fixture graceful quit failed')) : resolve(); } };
        socket.onerror = () => { clearTimeout(timeout); reject(new Error('Fixture quit inspector unavailable')); };
      });
    } finally { socket.close(); }
  }
  const finished = await Promise.race([closed.then(() => true), pause(10000).then(() => false)]);
  if (!finished) { child.kill(); await closed; child = null; throw new Error('Fixture pet did not quit gracefully.'); }
  child = null;
}
async function start(dataDir) {
  const startupTarget = path.join(dataDir, 'startup-target.json');
  if (fs.existsSync(startupTarget)) fs.unlinkSync(startupTarget);
  inspectorUrl = null;
  child = spawn(executable, ['--inspect=127.0.0.1:0', '--background'], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-8192); inspectorUrl ||= stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/)?.[0]; });
  closed = once(child, 'close');
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error('Fixture pet exited before starting its service.');
    // The HTTP listener precedes Electron ready; lifecycle sync writes this only after ready.
    try { const endpoint = read(path.join(dataDir, 'connection.json')); if (endpoint.pid === child.pid && inspectorUrl && fs.existsSync(startupTarget)) return endpoint.base; } catch {}
    await pause(100);
  }
  throw new Error('Fixture pet startup timed out.');
}
async function call(base, route, body) {
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'PUT', ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  assert.equal(response.status, 200, route + ': ' + String(result.message || result.error || 'request failed')); return result;
}
function owned(dir) { return fs.existsSync(path.join(dir, marker)) && fs.readFileSync(path.join(dir, marker), 'utf8') === fixture; }
async function cleanup() {
  if (!fs.existsSync(stateFile)) return;
  for (const dir of [oldDir, newDir]) if (fs.existsSync(dir)) {
    assert.ok(owned(dir), 'Refusing cleanup of non-fixture user data');
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  for (const link of [oldLink, newLink]) if (fs.existsSync(link)) fs.unlinkSync(link);
  fs.unlinkSync(stateFile);
}
(async () => {
  if (phase === 'cleanup') return cleanup();
  if (phase === 'seed') {
    for (const item of [oldDir, newDir, oldLink, newLink, stateFile]) assert.ok(!fs.existsSync(item), 'Expected a clean runner: ' + path.basename(item));
    fs.mkdirSync(startup, { recursive: true });
    fs.mkdirSync(oldDir, { recursive: true }); fs.writeFileSync(path.join(oldDir, marker), fixture);
    write(stateFile, { owned: true, stableSource });
    mock = http.createServer(); await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
    const port = mock.address().port;
    const base = await start(oldDir);
    await call(base, '/preferences', { mode: 'pet', disableRoaming: true, disableThrow: true, autostart: true, chatSource: 'api', chatSourceChosen: true, replySeconds: 37 });
    const config = (await call(base, '/config')).main;
    for (const pet of config.pets) { pet.display = 'none'; pet.size = 377; }
    await call(base, '/config', config);
    await call(base, '/appearance', { family: 'Segoe UI', source: 'system' });
    await call(base, '/api/settings', { baseUrl: 'http://127.0.0.1:' + port + '/v1', model: 'fixture-model', apiKey: 'fixture-upgrade-key' });
    await call(base, '/quota/settings', { selected: 'proxy', proxy: { endpoint: 'https://quota.example.test/balance', credential: 'manual', header: 'Authorization', bearer: true, format: 'remaining', valuePath: 'data.balance', scale: 1, unit: 'CNY', key: 'fixture-quota-key' } });
    const profile = await fetch(base + '/api/profiles', { method: 'POST', body: JSON.stringify({ name: 'Upgrade fixture' }) }); assert.equal(profile.status, 200);
    await pause(800); await stop();
    assert.ok(read(path.join(oldDir, 'Local State')).os_crypt?.encrypted_key, 'Old app must flush its encryption key before upgrade');
    const store = new (require('../settings-store.cjs').SettingsStore)(oldDir);
    store.set('positions', { fixture: { x: 320, feet: 640 } });
    store.set('petEntries', { custom: { pets: [{ id: 'fixture-custom', name: 'Custom fixture', display: 'none', size: 333 }] } });
    store.set('onboarding', { shortcutPrompted: true, clientLauncherPrompted: true });
    for (const dir of ['main-animation/webm', 'pet/custom-animation/webm', 'fonts']) {
      fs.mkdirSync(path.join(oldDir, dir), { recursive: true }); fs.writeFileSync(path.join(oldDir, dir, 'fixture.bin'), 'fixture-asset');
    }
    write(path.join(oldDir, 'client-launcher.local.json'), { kind: 'file', file: process.execPath, name: 'Fixture client' });
    write(path.join(oldDir, 'runtime-path.json'), { executable: path.join(fixture, 'custom-codex', 'codex.exe') });
    assert.ok(fs.existsSync(oldLink));
    write(stateFile, { port, stableSource, settings: read(store.file), vault: read(store.vault) });
    console.log('PASS: old installed app saved encrypted fixture keys, profiles, size, font and Startup entry.');
  } else {
    assert.ok(owned(oldDir)); if(!stableSource)assert.ok(!fs.existsSync(newDir));
    const before = read(stateFile);
    let apiCalls = 0;
    mock = http.createServer(async (req, res) => {
      let body = ''; for await (const chunk of req) body += chunk;
      if (req.headers.authorization !== 'Bearer fixture-upgrade-key' || JSON.parse(body).model !== 'fixture-model') { res.writeHead(401); return res.end('{}'); }
      apiCalls++; res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: 'Upgrade fixture reply' } }] }));
    });
    await new Promise(resolve => mock.listen(before.port, '127.0.0.1', resolve));
    for (let attempt = 0; attempt < 2; attempt++) {
      const base = await start(newDir);
      // The migration deliberately excludes arbitrary files; mark only the newly verified fixture.
      assert.deepEqual(read(path.join(newDir, 'credentials.local.json')), before.vault);
      fs.writeFileSync(path.join(newDir, marker), fixture);
      const preferences = await call(base, '/preferences'); assert.equal(preferences.replySeconds, 37); assert.equal(preferences.autostart, true);
      const config = await call(base, '/config'); assert.equal(config.main.pets[0].size, 377); assert.equal(config.custom.pets[0].size, 333);
      assert.equal((await call(base, '/appearance')).family, 'Segoe UI');
      assert.equal((await call(base, '/client-launcher')).configured, true);
      const reply = await fetch(base + '/chat', { method: 'POST', body: JSON.stringify({ text: 'Fixture check' }), signal: AbortSignal.timeout(30000) }).then(r => r.json());
      assert.equal(reply.reply, 'Upgrade fixture reply', 'Migrated real Windows encryption must decrypt correctly: ' + (reply.message || 'unexpected reply'));
      for (let i = 0; i < 50 && !fs.existsSync(newLink); i++) await pause(100);
      assert.ok(fs.existsSync(newLink)); if(!stableSource)assert.equal(fs.existsSync(oldLink), false);
      const { psString } = require('../autostart.cjs');
      const args = execFileSync('powershell.exe', ['-NoProfile', '-Command', `. ${psString(path.resolve(__dirname, '../shell-shortcut.ps1'))};(New-PetShortcut ${psString(newLink)}).Arguments`], { windowsHide: true, encoding: 'utf8' });
      assert.ok(args.includes(newDir));
      await stop();
      for (const key of ['pet', 'api', 'apiProfiles', 'quota', 'positions', 'petEntries', 'onboarding']) assert.deepEqual(read(path.join(newDir, 'settings.json')).sections[key], before.settings.sections[key], key);
    }
    assert.equal(apiCalls, 2);
    assert.deepEqual(read(path.join(newDir, 'runtime-path.json')), read(path.join(oldDir, 'runtime-path.json')));
    if(!stableSource)assert.deepEqual(read(path.join(oldDir, 'settings.json')), before.settings, 'Old rollback settings remain untouched');
    for (const dir of ['main-animation/webm', 'pet/custom-animation/webm', 'fonts']) assert.equal(fs.readFileSync(path.join(newDir, dir, 'fixture.bin'), 'utf8'), 'fixture-asset');
    assert.equal(fs.existsSync(path.join(newDir, '.migration-pending.json')), false);
    console.log('PASS: real installed upgrade migrates keys, custom assets, preferences and Startup; second launch retains them.');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await stop(); if (mock) await new Promise(resolve => mock.close(resolve)); });
