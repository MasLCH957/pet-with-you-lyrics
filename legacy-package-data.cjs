const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIRECTORY_NAME, LEGACY_DATA_DIRECTORY_NAME } = require('./project.cjs');

const markers = ['settings.json', 'preferences.json', 'main-config.json'];
const files = ['credentials.local.json', 'appearance.json', 'positions.json', 'tray-state.json', 'api-settings.json', 'api-settings.json.profiles', 'quota.json', 'quota.json.profiles', 'client-launcher.local.json', 'memory.json', ...markers];
const directories = ['fonts', 'pet', 'main-animation', 'logs', 'legacy-settings'];
const names = [...directories, ...files];
const hasSettings = directory => fs.existsSync(directory) && !fs.lstatSync(directory).isSymbolicLink() && markers.some(name => fs.existsSync(path.join(directory, name)));
function isRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function assertStopped(source, running) {
  let pid;
  try { pid = JSON.parse(fs.readFileSync(path.join(source, 'connection.json'), 'utf8')).pid; } catch {}
  if (running(pid)) throw new Error('旧版桌宠仍在运行，请从旧版托盘退出桌宠后重试升级。');
}

function importLegacyPackageData(dataDir, { localAppData = process.env.LOCALAPPDATA, running = isRunning } = {}) {
  const journal = path.join(dataDir, '.migration-pending.json');
  if (!fs.existsSync(journal) && hasSettings(dataDir)) return { imported: false };
  const legacy = path.join(path.dirname(dataDir), LEGACY_DATA_DIRECTORY_NAME);
  let candidates = path.resolve(legacy) !== path.resolve(dataDir) && hasSettings(legacy) ? [legacy] : [];
  const packages = localAppData && path.join(localAppData, 'Packages');
  if (!candidates.length && packages && fs.existsSync(packages)) {
    // MSIX may redirect AppData writes; only import pet-owned files from one source.
    candidates = fs.readdirSync(packages, { withFileTypes: true })
      .filter(item => item.isDirectory() && !item.isSymbolicLink())
      .flatMap(item => [DATA_DIRECTORY_NAME, LEGACY_DATA_DIRECTORY_NAME].map(name => path.join(packages, item.name, 'LocalCache', 'Roaming', name)))
      .filter(hasSettings);
  }
  if (!fs.existsSync(journal) && !candidates.length) return { imported: false };
  if (!fs.existsSync(journal) && candidates.length > 1) throw new Error('发现多份旧桌宠设置，未自动选择。请先将要使用的配置备份到正常用户数据目录，再启动桌宠。');
  fs.mkdirSync(dataDir, { recursive: true });
  const lock = path.join(dataDir, '.migration.lock');
  if (fs.existsSync(lock)) {
    let pid;
    try { pid = JSON.parse(fs.readFileSync(lock, 'utf8')).pid; } catch { throw new Error('设置迁移锁损坏，请备份个人数据目录后联系维护者。'); }
    if (running(pid)) throw new Error('另一桌宠进程正在迁移设置，请稍后重试。');
    fs.unlinkSync(lock);
  }
  const fd = fs.openSync(lock, 'wx');
  const stage = path.join(dataDir, '.migration-stage');
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    if (!fs.existsSync(journal)) {
      if (hasSettings(dataDir)) return { imported: false };
      const source = candidates[0];
      assertStopped(source, running);
      // Never combine an existing vault or media directory with somebody else's settings.
      const entries = names.filter(name => fs.existsSync(path.join(source, name)) && !fs.lstatSync(path.join(source, name)).isSymbolicLink());
      for (const name of entries) {
        if (name !== 'client-launcher.local.json' && fs.existsSync(path.join(dataDir, name))) throw new Error('新数据目录已有部分配置，未混合旧设置。请备份 pet-with-you 数据目录后再处理迁移。');
      }
      fs.rmSync(stage, { recursive: true, force: true });
      fs.mkdirSync(stage);
      const pending = entries.filter(name => !fs.existsSync(path.join(dataDir, name)));
      for (const name of pending) fs.cpSync(path.join(source, name), path.join(stage, name), { recursive: true, filter: file => !fs.lstatSync(file).isSymbolicLink() });
      const temp = journal + '.tmp';
      fs.writeFileSync(temp, JSON.stringify({ entries: pending }));
      fs.renameSync(temp, journal);
    }
    // Resume interrupted commits before opening SettingsStore, even if settings.json exists.
    const pending = JSON.parse(fs.readFileSync(journal, 'utf8')).entries;
    if (!Array.isArray(pending) || pending.some(name => !names.includes(name))) throw new Error('设置迁移记录损坏，请备份个人数据目录后联系维护者。');
    for (const name of pending) {
      const from = path.join(stage, name), to = path.join(dataDir, name);
      if (fs.existsSync(from)) {
        if (fs.existsSync(to)) throw new Error('设置迁移目标发生冲突，已保留旧数据，请备份后联系维护者。');
        fs.renameSync(from, to);
      } else if (!fs.existsSync(to)) throw new Error('设置迁移文件缺失，已保留旧数据，请联系维护者。');
    }
    fs.unlinkSync(journal);
    return { imported: true };
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
    if (!fs.existsSync(journal)) fs.rmSync(stage, { recursive: true, force: true });
  }
}

module.exports = { importLegacyPackageData };
