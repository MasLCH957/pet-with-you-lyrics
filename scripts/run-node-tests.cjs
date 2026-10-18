const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const temporary = path.join(root, '.work', 'tmp');
fs.mkdirSync(temporary, { recursive: true });
const env = {
  ...process.env,
  TEMP: temporary,
  TMP: temporary,
  TMPDIR: temporary,
  npm_config_cache: path.join(root, '.npm-cache'),
};

const guard = path.join(__dirname, 'test-temp-guard.cjs');
const child = spawn(process.execPath, ['--require', guard, '--test', ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on('close', (code, signal) => {
  if (signal) {
    console.error('Node tests terminated by ' + signal);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
