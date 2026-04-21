"use strict";

const { app, BrowserWindow, Menu, session, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// ─── Configuration ───────────────────────────────────────────────────────────

const userConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf-8")
);

const CONFIG = {
  url: userConfig.url,
  allowedOrigin: new URL(userConfig.url).origin,
  appName: userConfig.appName || new URL(userConfig.url).hostname,
  kiosk: userConfig.kiosk || false,
  windowWidth: userConfig.windowWidth || 1280,
  windowHeight: userConfig.windowHeight || 800,
};

const IS_DEV = process.env.NODE_ENV === "development";

// ─── Allowed origins for navigation ──────────────────────────────────────────

function isAllowedURL(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin === CONFIG.allowedOrigin) return true;
    if (parsed.protocol === "about:") return true;
    if (parsed.protocol === "blob:") return true;
    return false;
  } catch {
    return false;
  }
}

// ─── Window creation ─────────────────────────────────────────────────────────

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: CONFIG.windowWidth,
    height: CONFIG.windowHeight,
    kiosk: CONFIG.kiosk,
    fullscreen: CONFIG.kiosk,
    autoHideMenuBar: true,
    title: CONFIG.appName,
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      devTools: IS_DEV,
      spellcheck: false,
      navigateOnDragDrop: false,
    },
  });

  // ─── Remove application menu completely ──────────────────────────────────
  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  // ─── Show loading screen first ───────────────────────────────────────────
  mainWindow.loadFile(path.join(__dirname, "loading.html"), {
    query: { appName: CONFIG.appName },
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
    mainWindow.loadURL(CONFIG.url);
  });

  // ─── Handle page load completion ─────────────────────────────────────────
  mainWindow.webContents.on("did-finish-load", () => {
    const currentURL = mainWindow.webContents.getURL();
    if (currentURL.includes("loading.html") && !currentURL.includes("error=true")) {
      mainWindow.loadURL(CONFIG.url);
      return;
    }
  });

  // ─── Handle load failures (offline / network errors) ─────────────────────
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;

    console.error(`Load failed: ${errorCode} ${errorDescription} for ${validatedURL}`);
    mainWindow.loadFile(path.join(__dirname, "loading.html"), {
      query: { error: "true", message: errorDescription || "Network error", appName: CONFIG.appName },
    });
  });

  // ─── Block navigation to disallowed origins ──────────────────────────────
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedURL(url)) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  // ─── Block new windows / popups ──────────────────────────────────────────
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedURL(url)) {
      mainWindow.loadURL(url);
    } else {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  // ─── Block DevTools shortcuts in production ──────────────────────────────
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (IS_DEV) return;

    const key = input.key.toLowerCase();
    const ctrl = input.control;
    const shift = input.shift;
    const alt = input.alt;

    if (key === "f12") { event.preventDefault(); return; }
    if (ctrl && shift && key === "i") { event.preventDefault(); return; }
    if (ctrl && shift && key === "j") { event.preventDefault(); return; }
    if (ctrl && !shift && !alt && key === "u") { event.preventDefault(); return; }
    if (ctrl && !shift && !alt && key === "l") { event.preventDefault(); return; }
    if (ctrl && key === "r") { event.preventDefault(); return; }
    if (ctrl && !shift && !alt && key === "g") { event.preventDefault(); return; }
    if (ctrl && shift && key === "c") { event.preventDefault(); return; }
    if (key === "f5") { event.preventDefault(); return; }
  });

  // ─── Prevent DevTools from being opened programmatically ─────────────────
  if (!IS_DEV) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  // ─── Window closed ───────────────────────────────────────────────────────
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  const defaultSession = session.defaultSession;

  defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ["clipboard-read", "clipboard-sanitized-write", "notifications"];
    callback(allowedPermissions.includes(permission));
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

// ─── Security: disable navigation via protocol handler ───────────────────────
app.on("web-contents-created", (event, contents) => {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  contents.on("will-navigate", (event, url) => {
    if (!isAllowedURL(url)) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedURL(url) && mainWindow) {
      mainWindow.loadURL(url);
    } else {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });
});
