// Module-level singleton — persists across client-side navigation within the same browser session.
// Cleared on hard refresh. Use only for transient file passing between pages.

let _file: File | null = null;

export const fileStore = {
  set(f: File) { _file = f; },
  get(): File | null { return _file; },
  clear() { _file = null; },
};
