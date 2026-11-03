import type { AppSettings } from "../types";

export type SettingsChangedDetail = {
  settings: AppSettings;
};

const CHANGED = "gdd:settings-changed";

export function emitSettingsChanged(settings: AppSettings): void {
  window.dispatchEvent(
    new CustomEvent<SettingsChangedDetail>(CHANGED, {
      detail: { settings },
    }),
  );
}

export function onSettingsChanged(
  handler: (detail: SettingsChangedDetail) => void,
): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<SettingsChangedDetail>).detail);
  };
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
