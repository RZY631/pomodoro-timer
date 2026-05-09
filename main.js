const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');
const zlib = require('zlib');

let mainWindow;
let tray;
let isQuitting = false;

// ─── PNG icon generator (no external deps) ──────────
function crc32Table() {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const crcTbl = crc32Table();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTbl[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcVal]);
}

function createDotPNG(color, w = 20, h = 20) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const cx = (w - 1) / 2, cy = (h - 1) / 2, r = (w - 1) / 2 - 1;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const off = y * (w * 4 + 1) + 1 + x * 4;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= r) {
        raw[off] = (color >> 16) & 0xff;
        raw[off + 1] = (color >> 8) & 0xff;
        raw[off + 2] = color & 0xff;
        raw[off + 3] = 0xff;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

// ─── Window ────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 340,
    height: 440,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setVisibleOnAllWorkspaces(true);
  mainWindow.loadFile('index.html');
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('blur', () => {
    mainWindow.webContents.send('window-blur');
  });
}

// ─── Tray ──────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromBuffer(createDotPNG(0xe94560));
  tray = new Tray(icon);
  tray.setToolTip('番茄钟');

  const ctx = { focus: '专注', shortBreak: '短休息', longBreak: '长休息' };
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());

  let curLabel = '番茄钟';
  let curPhase = '';

  ipcMain.on('update-tray', (_e, { label, phase }) => {
    curLabel = label || curLabel;
    if (phase) curPhase = phase;
    const txt = curLabel ? `${curLabel} - ${ctx[curPhase] || '番茄钟'}` : '番茄钟';
    tray.setToolTip(txt);
    try { tray.setTitle(curLabel || ''); } catch {}
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

// ─── IPC ───────────────────────────────────────────
function setupIPC() {
  ipcMain.on('show-notification', (_e, { title, body }) => {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body, silent: false });
      n.on('click', () => { mainWindow.show(); mainWindow.flashFrame(true); });
      n.show();
    }
    mainWindow.flashFrame(true);
  });

  ipcMain.on('toggle-always-on-top', () => {
    mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop());
    mainWindow.webContents.send('always-on-top-changed', mainWindow.isAlwaysOnTop());
  });

  ipcMain.on('get-always-on-top', (e) => {
    e.returnValue = mainWindow.isAlwaysOnTop();
  });

  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-close', () => mainWindow.hide());
}

// ─── App lifecycle ─────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIPC();
});

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {});
app.on('activate', () => mainWindow?.show());
