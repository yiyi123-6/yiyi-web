/** Resolve a path inside /public against the deploy base path (e.g. /my-repo/ on GitHub Pages). */
export function asset(path: string) {
  if (!path || /^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path
  return import.meta.env.BASE_URL + path.replace(/^\//, '')
}
