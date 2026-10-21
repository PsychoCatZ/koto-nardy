// КотоНарды — Electron-обёртка (Windows / Linux / macOS)
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// Собранный фронт лежит в подпапке app/ (копия dist веб-сборки)
const DIST = path.join(__dirname, 'app');

// Кастомная схема вместо file:// — иначе ES-модули и стили
// блокируются CORS при загрузке с диска.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#14100c',
    title: 'КотоНарды',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL('app://localhost/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const filePath = path.normalize(path.join(DIST, pathname));
      if (!filePath.startsWith(DIST)) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = fs.readFileSync(filePath);
      const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { headers: { 'content-type': mime } });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
