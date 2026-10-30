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

/**
 * Sends an invite straight to Yiyi's Gmail.
 * Uses her Google Apps Script relay (scripts/invite-relay.gs) when `links.inviteScriptUrl` is set,
 * otherwise FormSubmit (free; the very first submission triggers a one-time activation email).
 */
export async function sendInvite(invite: Invite): Promise<void> {
  let res: Response
  if (links.inviteScriptUrl) {
    // No custom headers: keeps this a "simple" CORS request, which Apps Script requires.
    res = await fetch(links.inviteScriptUrl, { method: 'POST', body: JSON.stringify(invite) })
  } else {
    res = await fetch(`https://formsubmit.co/ajax/${links.email}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: `♡ ${invite.subject}`,
        _template: 'box',
        _captcha: 'false',
        ...(invite.replyTo ? { _replyto: invite.replyTo, email: invite.replyTo } : {}),
        name: invite.name || 'A visitor',
        from: invite.source,
        message: invite.message,
      }),
    })
  }
  const data = (await res.json().catch(() => ({}))) as Reply
  if (!res.ok || String(data.success) !== 'true') throw new Error(data.message || `Invite failed (${res.status})`)
}

export function mailtoFor(subject: string, body: string) {
  return `mailto:${links.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
