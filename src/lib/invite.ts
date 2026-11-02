import { links } from '../data/content'
import type { Busy } from './calendar'

export type Invite = {
  subject: string
  message: string
  name?: string
  replyTo?: string
  /** Shown in the email so Yiyi knows where it came from (e.g. "Tiny AI"). */
  source: string
  /** Used for the calendar hold title, e.g. "All-day mountain hike". */
  activity?: string
  /** Proposed times (ISO instants, up to 5). The relay checks Yiyi's calendars and holds each one on hers. */
  slots?: { start: string; end: string }[]
  /** The visitor's IANA time zone, so the email shows their time too. */
  timeZone?: string
}

type Reply = { success?: string | boolean; message?: string; code?: string; conflicts?: string[] }

export class InviteError extends Error {
  constructor(message: string, readonly code?: string, readonly conflicts: string[] = []) {
    super(message)
  }
}

/** True once Yiyi's Apps Script relay URL is set in content.ts. */
export const canSendDirectly = Boolean(links.inviteScriptUrl)

/**
 * Sends an invite through Yiyi's Google Apps Script relay (scripts/invite-relay.gs),
 * which runs as her: the email is sent from her Gmail to her Gmail.
 */
export async function sendInvite(invite: Invite): Promise<void> {
  if (!links.inviteScriptUrl) throw new Error('Invite relay not configured')
  // No custom headers: keeps this a "simple" CORS request, which Apps Script requires.
  const res = await fetch(links.inviteScriptUrl, { method: 'POST', body: JSON.stringify(invite) })
  const data = (await res.json().catch(() => ({}))) as Reply
  if (!res.ok || String(data.success) !== 'true') throw new InviteError(data.message || `Invite failed (${res.status})`, data.code, data.conflicts)
}

export type Availability = { busy: Busy[]; calendarsMissing: string[] }

/** Busy blocks (no titles, ever) merged from Yiyi's calendars, via the relay. */
export async function fetchAvailability(from: Date, to: Date, signal?: AbortSignal): Promise<Availability> {
  if (!links.inviteScriptUrl) throw new Error('Invite relay not configured')
  const url = new URL(links.inviteScriptUrl)
  url.searchParams.set('action', 'availability')
  url.searchParams.set('from', from.toISOString())
  url.searchParams.set('to', to.toISOString())
  const res = await fetch(url, { signal })
  const data = (await res.json()) as Reply & { busy?: { start: string; end: string }[]; calendarsMissing?: string[] }
  if (!res.ok || String(data.success) !== 'true' || !Array.isArray(data.busy)) throw new Error(data.message || 'Availability failed')
  return {
    busy: data.busy.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) })).filter((b) => b.end > b.start),
    calendarsMissing: data.calendarsMissing ?? [],
  }
}

export function mailtoFor(subject: string, body: string) {
  return `mailto:${links.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
