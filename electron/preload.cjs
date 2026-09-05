// Exposição mínima para a página saber que está dentro do Electron.
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("caPlanner", { isDesktop: true });
