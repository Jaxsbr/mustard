#!/usr/bin/env node
// CI verification — remove after confirming checks

import { openDb, closeDb, getRecords } from './db.js';
import {
  render,
  clearScreen,
  hideCursor,
  showCursor,
  getViewportHeight,
  TABS,
} from './render.js';

// ── State ───────────────────────────────────────────────────────────────

const state = {
  tabIndex: 0,
  itemIndex: 0,
  scrollOffset: 0,
  detailMode: false,
  expandText: false,
  textScroll: 0,
};

const cache = {};

function loadTab(tabKey) {
  if (!cache[tabKey]) {
    cache[tabKey] = getRecords(tabKey);
  }
  return cache[tabKey];
}

function currentRecords() {
  return loadTab(TABS[state.tabIndex].key);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function adjustScroll() {
  const viewHeight = getViewportHeight();
  if (state.itemIndex < state.scrollOffset) {
    state.scrollOffset = state.itemIndex;
  } else if (state.itemIndex >= state.scrollOffset + viewHeight) {
    state.scrollOffset = state.itemIndex - viewHeight + 1;
  }
}

// ── Drawing ─────────────────────────────────────────────────────────────

function draw() {
  render(state, loadTab(TABS[state.tabIndex].key));
}

// ── Key handling ────────────────────────────────────────────────────────

function handleKey(key) {
  const records = currentRecords();

  // q or Ctrl+C — quit
  if (key === 'q' || key === '\x03') {
    shutdown();
    return;
  }

  // Escape — collapse expand → detail → list → quit
  if (key === '\x1b' && !key.startsWith('\x1b[')) {
    if (state.expandText) {
      state.expandText = false;
      state.textScroll = 0;
    } else if (state.detailMode) {
      state.detailMode = false;
    } else {
      shutdown();
    }
    draw();
    return;
  }

  // Right arrow / Tab — next tab
  if (key === '\x1b[C' || key === '\t') {
    state.tabIndex = (state.tabIndex + 1) % TABS.length;
    state.itemIndex = 0;
    state.scrollOffset = 0;
    state.detailMode = false;
    state.expandText = false;
    state.textScroll = 0;
    draw();
    return;
  }

  // Left arrow — previous tab
  if (key === '\x1b[D') {
    state.tabIndex = (state.tabIndex - 1 + TABS.length) % TABS.length;
    state.itemIndex = 0;
    state.scrollOffset = 0;
    state.detailMode = false;
    state.expandText = false;
    state.textScroll = 0;
    draw();
    return;
  }

  // Up / Down — context-dependent
  if (key === '\x1b[A' || key === '\x1b[B') {
    const dir = key === '\x1b[A' ? -1 : 1;
    if (state.expandText) {
      state.textScroll = Math.max(0, state.textScroll + dir);
    } else {
      state.itemIndex = clamp(state.itemIndex + dir, 0, records.length - 1);
      adjustScroll();
    }
    draw();
    return;
  }

  // Enter — list → detail → expand text
  if (key === '\r' || key === '\n') {
    if (records.length === 0) { draw(); return; }
    if (state.expandText) {
      // already expanded, do nothing
    } else if (state.detailMode) {
      state.expandText = true;
      state.textScroll = 0;
    } else {
      state.detailMode = true;
    }
    draw();
    return;
  }

  // r — refresh current tab
  if (key === 'r') {
    delete cache[TABS[state.tabIndex].key];
    draw();
    return;
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────

function shutdown() {
  closeDb();
  showCursor();
  clearScreen();
  process.stdout.write('\n  \x1b[38;2;225;173;1m●\x1b[0m Later.\n\n');
  process.exit(0);
}

function main() {
  if (!process.stdin.isTTY) {
    console.error('mustard requires an interactive terminal.');
    process.exit(1);
  }

  try {
    openDb();
  } catch (err) {
    console.error('Failed to open mustard database:', err.message);
    process.exit(1);
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  hideCursor();

  // Escape sequence buffering (arrow keys arrive as multi-byte)
  let escBuffer = '';
  let escTimer = null;

  process.stdin.on('data', (data) => {
    if (escBuffer.length > 0) {
      escBuffer += data;
      clearTimeout(escTimer);
      if (escBuffer.length >= 3) {
        handleKey(escBuffer);
        escBuffer = '';
        return;
      }
      escTimer = setTimeout(() => {
        handleKey(escBuffer);
        escBuffer = '';
      }, 50);
      return;
    }

    if (data === '\x1b') {
      escBuffer = data;
      escTimer = setTimeout(() => {
        handleKey(escBuffer);
        escBuffer = '';
      }, 50);
      return;
    }

    handleKey(data);
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => showCursor());
  process.stdout.on('resize', draw);

  draw();
}

main();
