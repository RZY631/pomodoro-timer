const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (data) => ipcRenderer.send('show-notification', data),
  updateTray: (data) => ipcRenderer.send('update-tray', data),
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.sendSync('get-always-on-top'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onAlwaysOnTopChanged: (cb) => ipcRenderer.on('always-on-top-changed', (_e, v) => cb(v)),
  onWindowBlur: (cb) => ipcRenderer.on('window-blur', () => cb()),
});
