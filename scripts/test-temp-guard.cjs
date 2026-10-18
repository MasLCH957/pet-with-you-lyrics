const fs = require('node:fs');
const path = require('node:path');

const temporaryRoot = path.resolve(__dirname, '..', '.work', 'tmp') + path.sep;
const originalRmSync = fs.rmSync;

fs.rmSync = function rmSyncWithProjectTempRetry(target, options = {}) {
  let resolved;
  try {
    resolved = path.resolve(String(target));
  } catch {
    return originalRmSync(target, options);
  }
  if (!resolved.startsWith(temporaryRoot) || !options.recursive) {
    return originalRmSync(target, options);
  }
  return originalRmSync(target, {
    maxRetries: 20,
    retryDelay: 150,
    ...options,
  });
};
