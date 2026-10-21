const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// Кастомная схема app:// для обслуживания билда Vite из файловой системы.
// Нужна, потому что у продакшен-билда Vite абсолютные пути /assets/*,
// которые file:// открыть не может из-за CORS/путей.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'КотоНарды',
    autoHideMenuBar: true,
    backgroundColor: '#1a1210',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL('app://localhost/index.html');
}

app.whenReady().then(() => {
  const distDir = path.join(__dirname, 'app');

  protocol.handle('app', (request) => {
    let url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    let filePath = path.join(distDir, pathname);
    // Защита от path traversal.
    if (!filePath.startsWith(distDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    let ext = path.extname(filePath).toLowerCase();
    let type = MIME[ext] || 'application/octet-stream';

    try {
      let data = fs.readFileSync(filePath);
      return new Response(data, { headers: { 'Content-Type': type } });
    } catch {
      return new Response('Not found', { status: 404 });
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
