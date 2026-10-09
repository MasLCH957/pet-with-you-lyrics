const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
test('Windows safeStorage secrets decrypt after branded directory migration without Chromium session data', { skip: process.platform !== 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-encryption-upgrade-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  const source = path.join(root, 'DSH Pet Companion'), target = path.join(root, 'pet-with-you'), cipher = path.join(root, 'cipher');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const run = (dir, op) => spawnSync(require('electron'), [path.join(__dirname, 'encryption-fixture.cjs'), dir, cipher, op], { env, windowsHide: true, stdio: 'ignore', timeout: 30000 });
  assert.equal(run(source, 'encrypt').status, 0);
  const stateFile = path.join(source, 'Local State'), state = JSON.parse(fs.readFileSync(stateFile));
  state.unrelated_session = { fixture: true }; fs.writeFileSync(stateFile, JSON.stringify(state));
  fs.writeFileSync(path.join(source, 'settings.json'), JSON.stringify({ schemaVersion: 1, sections: {} }));
  require('../legacy-package-data.cjs').importLegacyPackageData(target, { localAppData: '' });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(target, 'Local State')))), ['os_crypt']);
  assert.equal(run(target, 'decrypt').status, 0, 'Keep the DPAPI-protected encryption key, not just the ciphertext');
});
