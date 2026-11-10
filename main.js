// MagicPencil27 - desktop app (Electron).
// Runs the editor server inside the app on a random local port and shows the
// UI in its own window (no browser). Closing the window quits everything.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  let port;
  try {
    port = await require('./server').start(0);
  } catch (e) {
    dialog.showErrorBox('MagicPencil27', 'Gagal menjalankan editor:\n' + e.message);
    app.quit();
    return;
  }
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680,
    title: 'MagicPencil27',
    backgroundColor: '#14161c',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // external links open in the real browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) { e.preventDefault(); shell.openExternal(url); }
  });
  // F5 / Ctrl+R reload, F12 devtools (handy for bug reports)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) win.webContents.reload();
    if (input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
  // Test hook: FM_EDITOR_SCREENSHOT=<png path> saves a screenshot and quits.
  if (process.env.FM_EDITOR_SCREENSHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      require('fs').writeFileSync(process.env.FM_EDITOR_SCREENSHOT, img.toPNG());
      app.quit();
    }, 2500));
  }
  win.on('closed', () => { win = null; });
});

app.on('window-all-closed', () => app.quit());
