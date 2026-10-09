const { runtimeFiles } = require('./export-source.cjs');
module.exports = {
  appId: 'im.refiningcolors.petwithyou',
  productName: 'pet-with-you',
  executableName: 'pet-with-you',
  artifactName: '${productName}-${version}-${arch}-setup.${ext}',
  directories: { output: 'dist', buildResources: 'build' },
  electronDist: require('node:path').dirname(require('electron')),
  // External PowerShell and command helpers need real filesystem paths.
  asar: false,
  compression: 'maximum',
  files: [
    ...runtimeFiles, 'assets/**/*', 'runtime/**/*', 'ui/**/*', 'README.md', 'SECURITY.md', 'CHANGELOG.md', 'docs/**/*',
    '!docs/releases/**/*', '!docs/PROJECT_HISTORY.md', '!docs/VIDEO*.md', '!docs/MEDIA_GUIDE.md', '!docs/WORKSPACE.md',
    '!docs/images/**/*', '!assets/fonts/**/*', '!**/node_modules/**/*', '!**/.local/**/*', '!**/*.log',
  ],
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'build/icon.ico', signAndEditExecutable: true },
  nsis: {
    oneClick: false, perMachine: false, allowElevation: false,
    // Updates currently use the full installer; allow solid maximum compression.
    differentialPackage: false,
    // The custom directory page shows the real branded destination before continuing.
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: false, createStartMenuShortcut: true,
    shortcutName: 'pet-with-u', runAfterFinish: false,
    installerIcon: 'build/icon.ico', uninstallerIcon: 'build/icon.ico',
    installerSidebar: 'build/pet-finish.bmp', uninstallerSidebar: 'build/pet-finish.bmp',
    include: 'build/installer.nsh', deleteAppDataOnUninstall: false,
    installerLanguages: ['zh_CN', 'en_US'],
    license: 'PREVIEW-NOTICE.txt',
  },
  publish: [{ provider: 'github', owner: 'Refining-colors', repo: 'pet-with-you', releaseType: 'release' }],
};
