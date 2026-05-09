# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — launch the Electron app
- No test/lint/build tooling; purely vanilla JS

## Architecture

Three-layer Electron app with context isolation:

- **main.js** — Electron main process. Creates a frameless, transparent, always-on-top window (340×440). Generates the tray icon PNG programmatically (no external assets). Handles: window lifecycle (hide-to-tray), tray menu, OS notifications, IPC for window controls and always-on-top toggle.
- **preload.js** — `contextBridge.exposeInMainWorld('electronAPI', ...)` — the sole IPC bridge. Exposes `showNotification`, `updateTray`, `toggleAlwaysOnTop`, `getAlwaysOnTop`, `windowMinimize`, `windowClose`, and event listeners. Never expose `ipcRenderer` directly.
- **renderer.js** — All UI logic in one file. Timer state machine (IDLE → RUNNING → PAUSED → IDLE), SVG progress ring via `stroke-dashoffset`, settings in `localStorage`, keyboard shortcuts (Space=toggle, R=reset, Esc=reset). Uses `window.electronAPI.*` for main-process calls.
- **styles.css** — iOS 26 glassmorphism: `backdrop-filter: blur(50-60px)`, semi-transparent backgrounds, layered radial gradient backgrounds, SVG noise texture, environment light orbs. Mode-specific colors driven by `body.mode-focus / mode-shortBreak / mode-longBreak` CSS classes and `--accent-current` variable.
- **index.html** — single page, no router. `timer-card` wrapper around the SVG ring + display. Settings modal with glass panel overlay.

## Key Patterns

- **Color theming**: Three modes (focus=red, shortBreak=green, longBreak=blue). Body class toggles CSS variables, which update gradients, ring stroke, button gradients, and ambient orbs simultaneously via CSS transitions.
- **Timer**: `setInterval`-based 1s tick. Progress ring calculated as `offset = circumference * (1 - timeRemaining/totalDuration)`. Auto-switches between focus and break modes on completion based on session count.
- **Settings**: Saved to `localStorage` key `pomodoro-settings`. Applied without restart. Settings modal reads/writes minutes, internally converts to seconds.
- **Window**: No native frame. Drag via `-webkit-app-region: drag` on titlebar. Close hides to tray (app keeps running). Quit only via tray menu.
