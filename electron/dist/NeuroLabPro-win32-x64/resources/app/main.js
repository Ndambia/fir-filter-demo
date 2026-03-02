'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Keep a global reference so the window is not garbage-collected.
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'NeuroLab Pro',
        icon: path.join(__dirname, '..', 'Visualizer', 'icons', 'icon-512.png'),
        backgroundColor: '#060810',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // Allow loading local files (CSV drag & drop, local fonts, etc.)
            webSecurity: false,
        },
        // Native title bar; remove frame: false so we keep OS window controls.
        autoHideMenuBar: true,
    });

    // Load the existing Visualizer
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    // Open external links in the OS default browser, not inside Electron.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    // macOS: re-create a window when the dock icon is clicked and no other
    // windows are open.
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Quit on all windows closed (standard behaviour on Windows / Linux).
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
