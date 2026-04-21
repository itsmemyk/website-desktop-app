"use strict";

// Minimal preload script — runs in an isolated context (contextIsolation: true).
// Its only job is to block right-click context menus that could expose "Copy Link",
// "Inspect", or other browser-like options.

window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  return false;
});

// Block drag-and-drop of files into the window (could trigger navigation)
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

window.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
});
