import type { DocVariable } from "../types";

export type VariablesChangedDetail = {
  projectId: string;
  variables: DocVariable[];
};

const CHANGED = "gdd:variables-changed";

export function emitVariablesChanged(
  projectId: string,
  variables: DocVariable[],
): void {
  window.dispatchEvent(
    new CustomEvent<VariablesChangedDetail>(CHANGED, {
      detail: { projectId, variables },
    }),
  );
}

export function onVariablesChanged(
  handler: (detail: VariablesChangedDetail) => void,
): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<VariablesChangedDetail>).detail);
  };
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
