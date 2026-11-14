/**
 * Paths relative to an assignment root.
 *
 * Ported from the VS Code recorder's `session/assignment-relative-path.ts`. JupyterLab paths
 * are already relative to the server root and use forward slashes, so no OS path handling is
 * needed. A root of `''` is the server root itself.
 */

/** `path` relative to `root`, or `null` when `path` is outside `root`. */
export function relativeToRoot(root: string, path: string): string | null {
  if (root === '') return path;
  if (path === root) return '';
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null;
}
