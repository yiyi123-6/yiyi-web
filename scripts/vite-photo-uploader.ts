import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Connect, Plugin } from 'vite'

/**
 * Dev-server-only API behind #/mountains/add-photo. Writes into photos/mountains/<hike-id>/,
 * which src/lib/hikePhotos.ts picks up. Never part of the production build.
 */
const ROOT = path.resolve('photos/mountains')
const HIKES = path.resolve('src/data/hikes.json')
const IMAGE = /\.(jpe?g|png|webp|avif|gif)$/i
const MAX_BYTES = 15 * 1024 * 1024
const run = promisify(execFile)

const hikeIds = () => new Set<string>(JSON.parse(fs.readFileSync(HIKES, 'utf8')).hikes.map((h: { id: string }) => h.id))

function hikeDir(id: unknown) {
  if (typeof id !== 'string' || !hikeIds().has(id)) throw new HttpError(400, `Unknown hike "${id}"`)
  const dir = path.join(ROOT, id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeFile(name: unknown) {
  if (typeof name !== 'string' || name !== path.basename(name) || !IMAGE.test(name)) throw new HttpError(400, `Bad file name "${name}"`)
  return name
}

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function list() {
  const out: Record<string, string[]> = {}
  for (const id of hikeIds()) {
    const dir = path.join(ROOT, id)
    out[id] = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => IMAGE.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : []
  }
  return out
}

/** Renames a hike's photos to 01-…, 02-… in the given order, with new captions. */
function reorder(dir: string, files: { file: string; caption: string }[]) {
  const existing = new Set(fs.readdirSync(dir))
  for (const f of files) if (!existing.has(safeFile(f.file))) throw new HttpError(400, `No such photo ${f.file}`)
  const staged = files.map((f, i) => {
    const tmp = `.tmp-${i}-${f.file}`
    fs.renameSync(path.join(dir, f.file), path.join(dir, tmp))
    return { tmp, ext: path.extname(f.file).toLowerCase(), caption: slug(f.caption) }
  })
  staged.forEach((s, i) => {
    const n = String(i + 1).padStart(2, '0')
    fs.renameSync(path.join(dir, s.tmp), path.join(dir, `${n}${s.caption ? `-${s.caption}` : ''}${s.ext}`))
  })
}

async function readBody(req: Connect.IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_BYTES) throw new HttpError(413, 'Photo is too big (15 MB max)')
    chunks.push(c as Buffer)
  }
  return Buffer.concat(chunks)
}

async function publish() {
  const git = (...args: string[]) => run('git', args, { cwd: process.cwd() })
  await git('add', '--', 'photos/mountains')
  const { stdout: staged } = await git('diff', '--cached', '--name-only', '--', 'photos/mountains')
  if (!staged.trim()) return 'Nothing new to publish.'
  const count = staged.trim().split('\n').length
  await git('commit', '-m', `Mountains: update hike photos (${count} file${count === 1 ? '' : 's'})`, '--', 'photos/mountains')
  const { stdout: branch } = await git('rev-parse', '--abbrev-ref', 'HEAD')
  await git('push', 'origin', `HEAD:${branch.trim()}`)
  return `Committed ${count} file${count === 1 ? '' : 's'} and pushed to ${branch.trim()}.`
}

export function photoUploader(): Plugin {
  return {
    name: 'yiyi-photo-uploader',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__photos', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        try {
          if (req.method === 'GET' && url.pathname === '/') return send(200, list())
          if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
          if (url.pathname === '/upload') {
            const dir = hikeDir(url.searchParams.get('hike'))
            const name = safeFile(url.searchParams.get('name'))
            const body = await readBody(req)
            if (!body.length) throw new HttpError(400, 'Empty upload')
            let file = name
            for (let n = 2; fs.existsSync(path.join(dir, file)); n++) file = name.replace(/(\.[^.]+)$/, `-${n}$1`)
            fs.writeFileSync(path.join(dir, file), body)
            return send(200, { file })
          }
          const json = JSON.parse((await readBody(req)).toString('utf8') || '{}')
          if (url.pathname === '/delete') {
            fs.rmSync(path.join(hikeDir(json.hike), safeFile(json.file)))
            return send(200, { ok: true })
          }
          if (url.pathname === '/order') {
            reorder(hikeDir(json.hike), json.files)
            return send(200, { ok: true })
          }
          if (url.pathname === '/publish') return send(200, { message: await publish() })
          throw new HttpError(404, 'Not found')
        } catch (e) {
          const err = e as Error & { status?: number; stderr?: string }
          send(err.status ?? 500, { error: err.stderr?.trim() || err.message })
        }
      })
    },
  }
}
