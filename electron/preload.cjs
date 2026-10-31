const { contextBridge, ipcRenderer } = require('electron');

// Única ponte entre a interface e o sistema: listar e imprimir na térmica.
contextBridge.exposeInMainWorld('thermal', {
  list: () => ipcRenderer.invoke('thermal:list'),
  print: (id, data, title) => ipcRenderer.invoke('thermal:print', { id, data, title }),
});
