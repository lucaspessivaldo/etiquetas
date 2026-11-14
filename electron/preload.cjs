const { contextBridge, ipcRenderer } = require('electron');

// Única ponte entre a interface e o sistema: listar, imprimir e ver/limpar a fila da térmica.
contextBridge.exposeInMainWorld('thermal', {
  list: () => ipcRenderer.invoke('thermal:list'),
  print: (id, data, title) => ipcRenderer.invoke('thermal:print', { id, data, title }),
  queue: (id) => ipcRenderer.invoke('thermal:queue', id),
  clear: (id) => ipcRenderer.invoke('thermal:clear', id),
});
