const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cacheRoot = path.join(root, '.work');
const cli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
const env = {
  ...process.env,
  npm_config_cache: path.join(root, '.npm-cache'),
  electron_config_cache: path.join(cacheRoot, 'cache', 'electron'),
  ELECTRON_BUILDER_CACHE: path.join(cacheRoot, 'cache', 'electron-builder'),
};

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
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
    console.error('electron-builder terminated by ' + signal);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
