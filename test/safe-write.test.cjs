const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeFileAtomic, writeJsonAtomic } = require('../safe-write.cjs');

test('atomic writes use rename when the filesystem supports it', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-write-rename-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'value.txt');
  fs.writeFileSync(file, 'old');
  writeFileAtomic(file, 'new');
  assert.equal(fs.readFileSync(file, 'utf8'), 'new');
  assert.deepEqual(fs.readdirSync(directory), ['value.txt']);
});

test('EXDEV falls back to in-place replacement without losing data', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-write-efs-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'settings.json');
  fs.writeFileSync(file, '{"old":true}');
  writeJsonAtomic(file, { updated: true }, {
    renameSync() {
      const error = new Error('cross-device link not permitted');
      error.code = 'EXDEV';
      throw error;
    },
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { updated: true });
  assert.deepEqual(fs.readdirSync(directory), ['settings.json']);
});

test('non-EXDEV rename failures remain visible', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-write-error-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'value.txt');
  fs.writeFileSync(file, 'old');
  assert.throws(
    () => writeFileAtomic(file, 'new', {
      renameSync() {
        const error = new Error('access denied');
        error.code = 'EACCES';
        throw error;
      },
    }),
    /access denied/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'old');
  assert.deepEqual(fs.readdirSync(directory), ['value.txt']);
});
