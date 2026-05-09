// ─── State ─────────────────────────────────────────
const MODE = { FOCUS: 'focus', SHORT_BREAK: 'shortBreak', LONG_BREAK: 'longBreak' };
const STATE = { IDLE: 'idle', RUNNING: 'running', PAUSED: 'paused' };

const MODE_LABELS = { focus: '专注', shortBreak: '短休息', longBreak: '长休息' };

const CIRCUMFERENCE = 2 * Math.PI * 85; // ~534

let settings = loadSettings();
let mode = MODE.FOCUS;
let timerState = STATE.IDLE;
let timeRemaining = settings.focusDuration;
let sessionCount = 0;
let intervalId = null;

// ─── DOM refs ──────────────────────────────────────
const $ = (id) => document.getElementById(id);
const timerDisplay = $('timerDisplay');
const phaseLabel = $('phaseLabel');
const sessionCountEl = $('sessionCount');
const ringFg = $('ringFg');
const ringEnd = $('ringEnd');
const timerCard = $('timerCard');
const btnPrimary = $('btnPrimary');
const btnReset = $('btnReset');
const btnPin = $('btnPin');
const btnMinimize = $('btnMinimize');
const btnClose = $('btnClose');
const btnSettings = $('btnSettings');
const settingsOverlay = $('settingsOverlay');
const inputFocus = $('inputFocus');
const inputShortBreak = $('inputShortBreak');
const inputLongBreak = $('inputLongBreak');
const inputLongBreakInterval = $('inputLongBreakInterval');
const btnSaveSettings = $('btnSaveSettings');
const modeBtns = document.querySelectorAll('.mode-btn');

// ─── Settings ──────────────────────────────────────
function loadSettings() {
  try {
    const raw = localStorage.getItem('pomodoro-settings');
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {}
  return defaultSettings();
}

function defaultSettings() {
  return {
    focusDuration: 25 * 60,
    shortBreakDuration: 5 * 60,
    longBreakDuration: 15 * 60,
    longBreakInterval: 4,
  };
}

function saveSettings(s) {
  localStorage.setItem('pomodoro-settings', JSON.stringify(s));
}

// ─── Timer core ────────────────────────────────────
function getDuration() {
  if (mode === MODE.FOCUS) return settings.focusDuration;
  if (mode === MODE.SHORT_BREAK) return settings.shortBreakDuration;
  return settings.longBreakDuration;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateRingEndpoint(progress) {
  const cx = 100, cy = 100, r = 85;
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  ringEnd.setAttribute('cx', x);
  ringEnd.setAttribute('cy', y);
}

function updateDisplay() {
  timerDisplay.textContent = formatTime(timeRemaining);
  phaseLabel.textContent = MODE_LABELS[mode];
  sessionCountEl.textContent = sessionCount;

  // Progress ring
  const total = getDuration();
  const progress = total > 0 ? timeRemaining / total : 1;
  const offset = CIRCUMFERENCE * (1 - progress);
  ringFg.style.strokeDasharray = CIRCUMFERENCE;
  ringFg.style.strokeDashoffset = offset;
  updateRingEndpoint(progress);

  // Update SVG gradient stops to match current accent
  const grad = document.querySelector('#ringGradient');
  if (grad) {
    const style = getComputedStyle(document.body);
    const accent = style.getPropertyValue('--accent-current').trim();
    const accentLight = style.getPropertyValue('--accent-light').trim();
    grad.querySelector('stop:first-child').setAttribute('stop-color', accent);
    grad.querySelector('stop:last-child').setAttribute('stop-color', accentLight);
  }

  // Tray
  window.electronAPI.updateTray({ label: formatTime(timeRemaining), phase: mode });
}

function updateBodyClass() {
  document.body.className = `mode-${mode}`;
}

function updateModeButtons() {
  modeBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function switchMode(newMode) {
  if (timerState === STATE.RUNNING) stopTimer();
  mode = newMode;
  timerState = STATE.IDLE;
  timeRemaining = getDuration();
  btnPrimary.textContent = '开始';
  updateBodyClass();
  updateModeButtons();
  updateDisplay();
  updateCardState();

  // Mode switch animation
  timerCard.classList.remove('mode-switching');
  void timerCard.offsetWidth;
  timerCard.classList.add('mode-switching');
  // Phase label crossfade
  phaseLabel.classList.remove('switching');
  void phaseLabel.offsetWidth;
  phaseLabel.classList.add('switching');
  setTimeout(() => phaseLabel.classList.remove('switching'), 300);
}

function onTimerComplete() {
  timerState = STATE.IDLE;
  btnPrimary.textContent = '开始';
  timerDisplay.classList.add('completed');
  setTimeout(() => timerDisplay.classList.remove('completed'), 1800);
  updateCardState();

  if (mode === MODE.FOCUS) {
    sessionCount++;
    sessionCountEl.textContent = sessionCount;
    // Badge pop animation
    const badge = sessionCountEl.closest('.session-count');
    badge.classList.remove('pop');
    void badge.offsetWidth;
    badge.classList.add('pop');
    window.electronAPI.showNotification({
      title: '番茄钟',
      body: `专注完成！已完成 ${sessionCount} 个番茄。`,
    });
    // Auto-switch to break
    const nextMode =
      sessionCount % settings.longBreakInterval === 0 ? MODE.LONG_BREAK : MODE.SHORT_BREAK;
    switchMode(nextMode);
  } else {
    // Break finished → back to focus
    window.electronAPI.showNotification({
      title: '番茄钟',
      body: `${MODE_LABELS[mode]}结束，开始新一轮专注吧！`,
    });
    switchMode(MODE.FOCUS);
  }
}

// ─── Card state visual ─────────────────────────────
function updateCardState() {
  timerCard.classList.remove('running', 'paused');
  if (timerState === STATE.RUNNING) {
    timerCard.classList.add('running');
  } else if (timerState === STATE.PAUSED) {
    timerCard.classList.add('paused');
  }
}

// ─── Timer control ─────────────────────────────────
function startTimer() {
  if (timerState === STATE.PAUSED && timeRemaining <= 0) return;
  timerState = STATE.RUNNING;
  btnPrimary.textContent = '暂停';
  updateCardState();
  intervalId = setInterval(() => {
    timeRemaining--;
    updateDisplay();
    if (timeRemaining <= 0) {
      stopTimer();
      onTimerComplete();
    }
  }, 1000);
}

function pauseTimer() {
  timerState = STATE.PAUSED;
  btnPrimary.textContent = '继续';
  clearInterval(intervalId);
  intervalId = null;
  updateCardState();
}

function stopTimer() {
  timerState = STATE.IDLE;
  btnPrimary.textContent = '开始';
  clearInterval(intervalId);
  intervalId = null;
  updateCardState();
}

function resetTimer() {
  stopTimer();
  timeRemaining = getDuration();
  updateDisplay();
}

function toggleTimer() {
  if (timerState === STATE.IDLE || timerState === STATE.PAUSED) {
    if (timeRemaining <= 0) {
      timeRemaining = getDuration();
    }
    startTimer();
  } else {
    pauseTimer();
  }
}

// ─── Settings UI ───────────────────────────────────
function openSettings() {
  inputFocus.value = Math.round(settings.focusDuration / 60);
  inputShortBreak.value = Math.round(settings.shortBreakDuration / 60);
  inputLongBreak.value = Math.round(settings.longBreakDuration / 60);
  inputLongBreakInterval.value = settings.longBreakInterval;
  settingsOverlay.classList.add('open');
}

function closeSettings() {
  settingsOverlay.classList.remove('open');
}

function applySettings() {
  const newSettings = {
    focusDuration: Math.max(1, parseInt(inputFocus.value) || 25) * 60,
    shortBreakDuration: Math.max(1, parseInt(inputShortBreak.value) || 5) * 60,
    longBreakDuration: Math.max(1, parseInt(inputLongBreak.value) || 15) * 60,
    longBreakInterval: Math.max(1, parseInt(inputLongBreakInterval.value) || 4),
  };
  const wasRunning = timerState === STATE.RUNNING;
  if (wasRunning) stopTimer();

  settings = newSettings;
  saveSettings(settings);

  // Recalculate current time if in the relevant mode
  const currentDuration = getDuration();
  if (timerState === STATE.IDLE || timeRemaining <= 0) {
    timeRemaining = currentDuration;
  } else if (timeRemaining > currentDuration) {
    timeRemaining = currentDuration;
  }
  updateDisplay();
  closeSettings();

  if (wasRunning) startTimer();
}

// Setting stepper helpers
function setupStepper(decId, incId, inputId) {
  const dec = $(decId);
  const inc = $(incId);
  const input = $(inputId);
  dec.addEventListener('click', () => {
    const val = parseInt(input.value) || 0;
    const min = parseInt(input.min) || 1;
    if (val > min) input.value = val - 1;
  });
  inc.addEventListener('click', () => {
    const val = parseInt(input.value) || 0;
    const max = parseInt(input.max) || 999;
    if (val < max) input.value = val + 1;
  });
}

setupStepper('decFocus', 'incFocus', 'inputFocus');
setupStepper('decShortBreak', 'incShortBreak', 'inputShortBreak');
setupStepper('decLongBreak', 'incLongBreak', 'inputLongBreak');
setupStepper('decInterval', 'incInterval', 'inputLongBreakInterval');

// ─── Ripple effect on buttons ──────────────────────
document.querySelectorAll('.btn').forEach((btn) => {
  btn.addEventListener('mousedown', (e) => {
    const rect = btn.getBoundingClientRect();
    btn.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
    btn.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
  });
});

// ─── Events ────────────────────────────────────────
btnPrimary.addEventListener('click', toggleTimer);
btnReset.addEventListener('click', resetTimer);

modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (timerState === STATE.RUNNING) return; // Don't switch while running
    switchMode(btn.dataset.mode);
  });
});

btnPin.addEventListener('click', () => {
  window.electronAPI.toggleAlwaysOnTop();
});
window.electronAPI.onAlwaysOnTopChanged((v) => {
  btnPin.style.opacity = v ? '1' : '0.4';
  btnPin.title = v ? '取消置顶' : '窗口置顶';
});

btnMinimize.addEventListener('click', () => window.electronAPI.windowMinimize());
btnClose.addEventListener('click', () => window.electronAPI.windowClose());

btnSettings.addEventListener('click', openSettings);
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings();
});
btnSaveSettings.addEventListener('click', applySettings);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (settingsOverlay.classList.contains('open')) {
    if (e.key === 'Escape') closeSettings();
    if (e.key === 'Enter') applySettings();
    return;
  }
  if (e.key === ' ' || e.key === 'Space') { e.preventDefault(); toggleTimer(); }
  if (e.key === 'r' || e.key === 'R') resetTimer();
  if (e.key === 'Escape') resetTimer();
});

// ─── Init ──────────────────────────────────────────
// Check initial always-on-top state
try { btnPin.style.opacity = window.electronAPI.getAlwaysOnTop() ? '1' : '0.4'; } catch {}

updateBodyClass();
updateModeButtons();
updateDisplay();
updateCardState();
