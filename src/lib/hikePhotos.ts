import { useEffect, useState } from 'react'
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

export const PHOTOS_CHANNEL = 'yiyis-universe:hike-photos'
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

export function captionFor(file: string) {
  return file
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[-_ ]*/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

const toPhoto = (hikeId: string, file: string, src: string): Photo => {
  const caption = captionFor(file)
  return { src, alt: caption || `Photo from ${hikeId.replace(/-/g, ' ')}`, caption }
}

const bundled = new Map<string, Photo[]>()
for (const path of Object.keys(files).sort(byName)) {
  const [, hikeId, file] = path.match(/\/photos\/mountains\/([^/]+)\/([^/]+)$/) ?? []
  if (!hikeId) continue
  bundled.set(hikeId, [...(bundled.get(hikeId) ?? []), toPhoto(hikeId, file, files[path])])
}

/**
 * On the dev server, photos/ isn't watched (new files would reload the page mid-upload), so the
 * current file list comes from the #/mountains/add-photo helper API instead of the bundle.
 */
export function useLivePhotoFiles(): Record<string, string[]> | null {
  const [live, setLive] = useState<Record<string, string[]> | null>(null)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const load = () =>
      fetch('/__photos/')
        .then((r) => (r.ok ? r.json() : null))
        .then(setLive)
        .catch(() => {})
    load()
    const channel = new BroadcastChannel(PHOTOS_CHANNEL)
    channel.onmessage = load
    return () => channel.close()
  }, [])
  return live
}

/** Photos from hikes.json that have a real src, followed by any from the hike's photo folder. */
export function photosForHike(id: string, fromJson: Photo[], live?: Record<string, string[]> | null): Photo[] {
  const extra = live
    ? (live[id] ?? []).map((f) => toPhoto(id, f, `/photos/mountains/${id}/${encodeURIComponent(f)}`))
    : (bundled.get(id) ?? [])
  const real = fromJson.filter((p) => p.src)
  if (real.length || extra.length) return [...real, ...extra]
  return fromJson
}
