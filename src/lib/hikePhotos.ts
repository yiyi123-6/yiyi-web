import type { Photo } from '../data/content'

/**
 * Photos dropped into photos/mountains/<hike-id>/ at the project root.
 * Files are shown in filename order, so prefix them (01-, 02-…) to choose the order;
 * the rest of the filename becomes the caption ("02-summit-snacks.jpg" → "summit snacks").
 */
const files = import.meta.glob<string>('/photos/mountains/*/*.{jpg,jpeg,png,webp,avif,gif,JPG,JPEG,PNG,WEBP,AVIF,GIF}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const byHike = new Map<string, Photo[]>()
for (const path of Object.keys(files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
  const [, hikeId, file] = path.match(/\/photos\/mountains\/([^/]+)\/([^/]+)$/) ?? []
  if (!hikeId) continue
  const caption = file
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[-_ ]*/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  const list = byHike.get(hikeId) ?? []
  list.push({ src: files[path], alt: caption || `Photo from ${hikeId.replace(/-/g, ' ')}`, caption })
  byHike.set(hikeId, list)
}

/** Photos from hikes.json that have a real src, followed by any from the hike's photo folder. */
export function photosForHike(id: string, fromJson: Photo[]): Photo[] {
  const extra = byHike.get(id) ?? []
  const real = fromJson.filter((p) => p.src)
  if (real.length || extra.length) return [...real, ...extra]
  return fromJson
}
