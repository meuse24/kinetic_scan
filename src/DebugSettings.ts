const STORAGE_KEY = 'spaceShooterDebugOverlayEnabled';

function readStoredDebugOverlayEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let debugOverlayEnabled = readStoredDebugOverlayEnabled();

export function isDebugOverlayEnabled() {
  return debugOverlayEnabled;
}

export function setDebugOverlayEnabled(enabled: boolean) {
  debugOverlayEnabled = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage failures.
  }
  return debugOverlayEnabled;
}

export function toggleDebugOverlayEnabled() {
  return setDebugOverlayEnabled(!debugOverlayEnabled);
}
