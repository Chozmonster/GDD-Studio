import type { AppSettings } from "../types";

export type SettingsChangedDetail = {
  settings: AppSettings;
};

const CHANGED = "gdd:settings-changed";

/**
 * Cross-window bus. Options often runs in a separate Tauri webview
 * (`?window=options`); `window` CustomEvents stay inside that webview.
 * BroadcastChannel reaches every same-origin window (editor + options).
 */
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(CHANGED)
    : null;

export function emitSettingsChanged(settings: AppSettings): void {
  const detail: SettingsChangedDetail = { settings };
  window.dispatchEvent(
    new CustomEvent<SettingsChangedDetail>(CHANGED, { detail }),
  );
  channel?.postMessage(detail);
}

export function onSettingsChanged(
  handler: (detail: SettingsChangedDetail) => void,
): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<SettingsChangedDetail>).detail);
  };
  window.addEventListener(CHANGED, listener);

  const onMessage = (e: MessageEvent<SettingsChangedDetail>) => {
    const detail = e.data;
    if (detail?.settings) handler(detail);
  };
  channel?.addEventListener("message", onMessage);

  return () => {
    window.removeEventListener(CHANGED, listener);
    channel?.removeEventListener("message", onMessage);
  };
}
