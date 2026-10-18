const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Atomically replace a file when the filesystem supports same-directory
 * renames. Windows EFS can report EXDEV for two files in the same directory
 * when their encryption state differs. In that case, overwrite the existing
 * destination in place and remove the encrypted staging file.
 */
function writeFileAtomic(file, data, options = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mode = options.mode ?? 0o600;
  const temporary = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(temporary, data, { mode });
  try {
    (options.renameSync || fs.renameSync)(temporary, file);
  } catch (error) {
    if (error?.code !== 'EXDEV') {
      try {
        fs.unlinkSync(temporary);
      } catch {
        // Preserve the original filesystem error.
      }
      throw error;
    }
    try {
      fs.writeFileSync(file, data, { mode });
    } finally {
      try {
        fs.unlinkSync(temporary);
      } catch {
        // The destination write result is authoritative.
      }
    }
  }
}

function writeJsonAtomic(file, value, options) {
  writeFileAtomic(file, JSON.stringify(value, null, 2), options);
}

module.exports = { writeFileAtomic, writeJsonAtomic };
