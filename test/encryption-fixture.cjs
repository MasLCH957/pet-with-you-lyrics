const fs = require('node:fs');
const { app, safeStorage } = require('electron');
const [dataDir, cipherFile, operation] = process.argv.slice(2);
app.setPath('userData', dataDir);
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  try {
    if (operation === 'encrypt') fs.writeFileSync(cipherFile, safeStorage.encryptString('synthetic-migration-fixture').toString('base64'));
    else if (safeStorage.decryptString(Buffer.from(fs.readFileSync(cipherFile, 'utf8'), 'base64')) !== 'synthetic-migration-fixture') throw new Error('Fixture decryption mismatch');
    app.quit();
  } catch { app.exit(1); }
});
