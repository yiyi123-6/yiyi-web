import { links } from '../data/content'

export type Invite = {
  subject: string
  message: string
  name?: string
  replyTo?: string
  /** Shown in the email so Yiyi knows where it came from (e.g. "Tiny AI"). */
  source: string
}

type Reply = { success?: string | boolean; message?: string }

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
  if (!res.ok || String(data.success) !== 'true') throw new Error(data.message || `Invite failed (${res.status})`)
}

export function mailtoFor(subject: string, body: string) {
  return `mailto:${links.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
