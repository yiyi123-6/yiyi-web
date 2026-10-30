import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Check, CloudUpload, ImagePlus, Loader2, Rocket, Search, Trash2 } from 'lucide-react'
import data from '../../data/hikes.json'
import { PHOTOS_CHANNEL, captionFor } from '../../lib/hikePhotos'

type Hike = { id: string; name: string; location: string }
type Item = { file: string; caption: string }
type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; text: string }

const hikes = data.hikes as Hike[]
const MAX_SIDE = 1600
const QUALITY = 0.82
const SELECTED_KEY = 'yiyis-universe:add-photo-hike'

const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)


/** Camera names like IMG_2041 or PXL_20250101 make bad captions. */
const isCameraName = (name: string) => /^(img|dsc|dscn|pxl|photo|image|mvimg|screenshot)?[-_ ]?[\d_ -]+$/i.test(name.replace(/\.[^.]+$/, ''))

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/__photos${path}`, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  return body as T
}

const post = <T,>(path: string, json: unknown) =>
  api<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) })

/** Downscales to MAX_SIDE and re-encodes as WebP so phone photos don't weigh down the site. */
async function compress(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(
      /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
        ? `${file.name}: this browser can't read HEIC. Export it as JPEG first (or try Safari).`
        : `${file.name}: not an image this browser can read.`,
    )
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', QUALITY))
  if (!blob) throw new Error(`${file.name}: couldn't compress this photo.`)
  return blob
}

export default function AddPhotos() {
  if (!import.meta.env.DEV) return <ProdNotice />
  return <Uploader />
}

function ProdNotice() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-32 text-center">
      <h1 className="font-display text-4xl font-black">Photo uploads live on your laptop.</h1>
      <p className="mt-4 text-ink/70">
        This page only works on the local preview (<code>npm run dev</code>, then open <code>#/mountains/add-photo</code>). You can
        also upload files on GitHub into <code>photos/mountains/&lt;hike-id&gt;/</code>.
      </p>
      <a href="#/mountains" className="btn-ink mt-8 inline-flex">
        <ArrowLeft size={16} /> Back to the mountains
      </a>
    </section>
  )
}

function Uploader() {
  const [all, setAll] = useState<Record<string, string[]>>({})
  // New files in photos/ can make Vite reload the page, so the selection survives in sessionStorage.
  const [selected, setSelectedState] = useState(() => {
    const saved = sessionStorage.getItem(SELECTED_KEY)
    return hikes.some((h) => h.id === saved) ? saved! : (hikes[0]?.id ?? '')
  })
  const setSelected = (id: string) => {
    sessionStorage.setItem(SELECTED_KEY, id)
    setSelectedState(id)
  }
  const [items, setItems] = useState<Item[]>([])
  const [dirty, setDirty] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' })
  const [dragging, setDragging] = useState(false)
  const [version, setVersion] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const list = await api<Record<string, string[]>>('/')
    setAll(list)
    const channel = new BroadcastChannel(PHOTOS_CHANNEL)
    channel.postMessage('changed')
    channel.close()
    setVersion((v) => v + 1)
    return list
  }, [])

  useEffect(() => {
    refresh().catch((e) => setStatus({ kind: 'error', text: `Couldn't reach the photo helper: ${e.message}` }))
  }, [refresh])

  useEffect(() => {
    setItems((all[selected] ?? []).map((file) => ({ file, caption: captionFor(file) })))
    setDirty(false)
  }, [all, selected])

  const hike = hikes.find((h) => h.id === selected)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? hikes.filter((h) => `${h.name} ${h.location}`.toLowerCase().includes(q)) : hikes
  }, [query])
  const total = Object.values(all).reduce((n, l) => n + l.length, 0)

  const run = async (busy: string, task: () => Promise<string>) => {
    setStatus({ kind: 'busy', text: busy })
    try {
      setStatus({ kind: 'ok', text: await task() })
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message })
    }
  }

  const upload = (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(hei[cf]|jpe?g|png|webp|avif|gif)$/i.test(f.name))
    if (!list.length) return
    void run(`Compressing and saving ${list.length} photo${list.length === 1 ? '' : 's'}…`, async () => {
      const start = items.length
      const failed: string[] = []
      for (const [i, f] of list.entries()) {
        try {
          const blob = await compress(f)
          const base = f.name.replace(/\.[^.]+$/, '')
          const caption = isCameraName(f.name) ? '' : slug(base)
          const name = `${String(start + i + 1).padStart(2, '0')}${caption ? `-${caption}` : ''}.webp`
          await api(`/upload?hike=${encodeURIComponent(selected)}&name=${encodeURIComponent(name)}`, { method: 'POST', body: blob })
        } catch (e) {
          failed.push((e as Error).message)
        }
      }
      await refresh()
      const saved = list.length - failed.length
      if (failed.length) throw new Error(`Saved ${saved}, but: ${failed.join(' · ')}`)
      return `Saved ${saved} photo${saved === 1 ? '' : 's'} to ${hike?.name}. They're already on its journal page.`
    })
  }

  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
    setDirty(true)
  }

  const save = () =>
    run('Saving order and captions…', async () => {
      await post('/order', { hike: selected, files: items })
      await refresh()
      return 'Order and captions saved.'
    })

  const remove = (file: string) =>
    run('Deleting…', async () => {
      await post('/delete', { hike: selected, file })
      await refresh()
      return `Deleted ${file}.`
    })

  const publish = () =>
    run('Committing and pushing to GitHub…', async () => {
      if (dirty) await post('/order', { hike: selected, files: items })
      const { message } = await post<{ message: string }>('/publish', {})
      await refresh()
      return message.startsWith('Committed') ? `${message} The live site updates once that branch is on main.` : message
    })

  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 pt-28 md:px-8">
      <a href="#/mountains" className="btn-cream !px-4 !py-2 text-sm">
        <ArrowLeft size={16} /> Back to the mountains
      </a>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-hand text-2xl text-berry">only on your laptop</p>
          <h1 className="font-display text-5xl font-black leading-[0.95] md:text-6xl">
            Add <span className="italic text-hot">trail photos.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-ink/70">
            Pick a hike, drop in photos, and they appear on its journal page right away. Photos are resized to {MAX_SIDE}px and
            saved as WebP, so phone pictures stay light. Hit <b>Publish</b> when you're happy to commit and push them.
          </p>
        </div>
        <button className="btn-hot" onClick={publish} disabled={status.kind === 'busy'}>
          <Rocket size={18} /> Publish {total ? `(${total} photo${total === 1 ? '' : 's'})` : ''}
        </button>
      </div>

      {status.text && (
        <p
          role="status"
          className={`mt-6 flex items-center gap-2 rounded-2xl border-2 border-ink px-4 py-3 text-sm font-semibold ${
            status.kind === 'error' ? 'bg-hot text-cream' : status.kind === 'ok' ? 'bg-baby' : 'bg-blush'
          }`}
        >
          {status.kind === 'busy' ? <Loader2 size={16} className="animate-spin" /> : status.kind === 'ok' ? <Check size={16} /> : null}
          {status.text}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <aside className="sticker h-fit bg-cream p-3 lg:sticky lg:top-24">
          <label className="flex items-center gap-2 rounded-xl border-2 border-ink bg-blush px-3 py-2">
            <Search size={16} className="text-berry" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a hike"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink/40"
            />
          </label>
          <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {shown.map((h) => {
              const n = all[h.id]?.length ?? 0
              return (
                <li key={h.id}>
                  <button
                    onClick={() => setSelected(h.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                      h.id === selected ? 'bg-ink text-cream' : 'hover:bg-blush'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{h.name}</span>
                      <span className={`block truncate text-xs ${h.id === selected ? 'text-cream/70' : 'text-ink/50'}`}>{h.location}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                        n ? 'bg-hot text-cream' : h.id === selected ? 'bg-cream/20' : 'bg-blush text-ink/50'
                      }`}
                    >
                      {n}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-3xl font-black">{hike?.name}</h2>
            <code className="text-xs text-ink/50">photos/mountains/{selected}/</code>
          </div>

          <button
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              upload(e.dataTransfer.files)
            }}
            className={`mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-[1.75rem] border-2 border-dashed border-ink px-6 py-12 text-center transition ${
              dragging ? 'bg-hot text-cream' : 'bg-blush hover:bg-baby'
            }`}
          >
            <CloudUpload size={36} />
            <span className="font-display text-2xl font-black">Drop photos here</span>
            <span className="text-sm opacity-70">or click to choose · JPG, PNG, WebP (HEIC works in Safari)</span>
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) upload(e.target.files)
              e.target.value = ''
            }}
          />

          {items.length ? (
            <>
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((it, i) => (
                  <li key={it.file} className={`sticker bg-cream p-2 ${i % 2 ? 'rotate-1' : '-rotate-1'}`}>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg border-2 border-ink bg-blush">
                      <img
                        src={`/photos/mountains/${selected}/${encodeURIComponent(it.file)}?v=${version}`}
                        alt={it.caption || hike?.name}
                        className="h-full w-full object-cover"
                      />
                      {i === 0 && (
                        <span className="absolute left-2 top-2 rounded-full bg-hot px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cream">
                          cover
                        </span>
                      )}
                    </div>
                    <input
                      value={it.caption}
                      onChange={(e) => {
                        setItems(items.map((x, k) => (k === i ? { ...x, caption: e.target.value } : x)))
                        setDirty(true)
                      }}
                      placeholder="caption (optional)"
                      aria-label={`Caption for photo ${i + 1}`}
                      className="mt-2 w-full rounded-lg border-2 border-transparent bg-transparent px-2 py-1 text-center font-hand text-xl outline-none focus:border-ink focus:bg-blush"
                    />
                    <div className="mt-1 flex items-center justify-between px-1">
                      <div className="flex gap-1">
                        <IconBtn label="Move earlier" onClick={() => move(i, -1)} disabled={i === 0}>
                          <ArrowUp size={14} />
                        </IconBtn>
                        <IconBtn label="Move later" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                          <ArrowDown size={14} />
                        </IconBtn>
                      </div>
                      <IconBtn label={`Delete ${it.file}`} onClick={() => remove(it.file)} danger>
                        <Trash2 size={14} />
                      </IconBtn>
                    </div>
                  </li>
                ))}
              </ul>
              {dirty && (
                <button className="btn-ink mt-6" onClick={save} disabled={status.kind === 'busy'}>
                  <Check size={16} /> Save order & captions
                </button>
              )}
            </>
          ) : (
            <p className="mt-6 flex items-center gap-2 text-ink/60">
              <ImagePlus size={18} /> No photos for this hike yet. The first one you add becomes the big cover photo.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-8 place-items-center rounded-full border-2 border-ink transition disabled:opacity-30 ${
        danger ? 'bg-cream hover:bg-hot hover:text-cream' : 'bg-cream hover:bg-baby'
      }`}
    >
      {children}
    </button>
  )
}
