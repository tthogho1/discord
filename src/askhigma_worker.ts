import { Hono } from 'hono'
import nacl from 'tweetnacl'

type Env = {
  DISCORD_PUBLIC_KEY: string
  HIGMA_API_BASE_URL: string
  SKIP_VERIFY?: string
}

const MAX_PROMPT_LENGTH = 2000

function isPrivateIp(hostname: string) {
  // rudimentary checks for common private IP ranges and localhost
  if (!hostname) return true
  if (/^127\.|^10\.|^192\.168\.|^169\.254\./.test(hostname)) return true
  if (/^::1$/.test(hostname)) return true
  if (/^localhost$/i.test(hostname)) return true
  return false
}

function validateHigmaUrl(urlStr: string) {
  if (!urlStr) return false
  try {
    const u = new URL(urlStr)
    if (u.protocol !== 'https:') return false
    // prevent IP/localhost targets to reduce SSRF risk
    if (isPrivateIp(u.hostname)) return false
    return true
  } catch {
    return false
  }
}
function hexToBytes(hex: string): Uint8Array {
  if (!hex || typeof hex !== 'string') throw new Error('hexToBytes: invalid input')
  const clean = hex.trim()
  if (clean.length % 2 !== 0) throw new Error('hexToBytes: odd-length hex')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    const v = parseInt(clean.slice(i, i + 2), 16)
    if (Number.isNaN(v)) throw new Error('hexToBytes: invalid hex char')
    bytes[i / 2] = v
  }
  return bytes
}

const app = new Hono<{ Bindings: Env }>()

// Middleware: verify Discord request signature and attach raw body
app.use('*', async (c, next) => {
  if (c.req.method !== 'POST') return c.text('ok')

  const signature = c.req.header('x-signature-ed25519')
  const timestamp = c.req.header('x-signature-timestamp')
  const raw = await c.req.text()
  ;(c.req as any).__raw = raw

  // Allow skipping verification for local testing
  if (c.env.SKIP_VERIFY === 'true') {
    await next()
    return
  }

  if (!signature || !timestamp) return c.text('invalid signature headers', 401)
  if (!c.env.DISCORD_PUBLIC_KEY) return c.text('DISCORD_PUBLIC_KEY not configured', 500)

  const pubKeyHex = c.env.DISCORD_PUBLIC_KEY.trim()
  if (pubKeyHex.length !== 64) {
    console.error(`DISCORD_PUBLIC_KEY has wrong length: ${pubKeyHex.length} chars (expected 64 hex chars)`)
    return c.text('DISCORD_PUBLIC_KEY has wrong length', 500)
  }

  try {
    const msg = new TextEncoder().encode(timestamp + raw)
    const sig = hexToBytes(signature)
    const pub = hexToBytes(pubKeyHex)
    const verified = nacl.sign.detached.verify(msg, sig, pub)
    if (!verified) return c.text('invalid request signature', 401)
  } catch (err) {
    console.error('Signature verification error:', String(err))
    return c.text('signature verification failed', 500)
  }

  // Validate HIGMA_API_BASE_URL early to avoid SSRF to local networks
  if (!validateHigmaUrl(c.env.HIGMA_API_BASE_URL)) {
    console.error('HIGMA_API_BASE_URL failed validation:', c.env.HIGMA_API_BASE_URL)
    return c.text('HIGMA_API_BASE_URL misconfigured', 500)
  }

  await next()
})

app.post('/', async (c) => {
  const raw = (c.req as any).__raw || (await c.req.text())
  try {
    const sig = c.req.header('x-signature-ed25519')
    const ts = c.req.header('x-signature-timestamp')
    const ct = c.req.header('content-type')
    // Sanitize logging: do not log full raw payloads or tokens
    let safeSummary = ''
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const cmd = parsed.data?.name ?? parsed.type
        const optionPreview = Array.isArray(parsed.data?.options) ? parsed.data.options.map((o: any) => ({ name: o.name, value: String(o.value).slice(0, 100) })) : undefined
        if (parsed.token) parsed.token = '[REDACTED]'
        safeSummary = `cmd=${cmd} options=${JSON.stringify(optionPreview)}`
      }
    } catch {
      safeSummary = raw.slice(0, 200)
    }
    console.info('askhigma_worker: x-signature-ed25519=', sig, 'x-signature-timestamp=', ts, 'content-type=', ct, 'summary=', safeSummary)
  } catch (e) {
    // best-effort logging; ignore errors
  }
  let interaction: any
  try {
    interaction = JSON.parse(raw)
  } catch {
    return c.text('invalid json', 400)
  }

  // PING
  if (interaction.type === 1) return c.json({ type: 1 })

  // Application command
  if (interaction.type === 2 && interaction.data?.name === 'askhigma') {
    const options = interaction.data.options || []
    const textOpt = options.find((o: any) => o.name === 'text')
    const prompt = textOpt?.value ?? ''
    if (!prompt) {
      return c.json({ type: 4, data: { content: 'Please provide text for /askhigma <text>' } })
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return c.json({ type: 4, data: { content: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters).` } })
    }

    const appId = interaction.application_id
    const token = interaction.token

    // Return a deferred response immediately (Discord shows "thinking...")
    // Then use waitUntil to call HIGMA and send the follow-up
    const followUpUrl = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`

    const runFollowUp = async () => {
        let content: string
        try {
          const res = await fetch(c.env.HIGMA_API_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: prompt }),
          })

          const respText = await res.text()
          let json: any
          try { json = JSON.parse(respText) } catch { json = null }

          if (!res.ok) {
            content = json?.error ?? respText ?? `HIGMA error: ${res.status}`
          } else {
            content = json?.answer ?? json?.text ?? json?.output ?? respText
          }
        } catch (err) {
          content = `Error contacting HIGMA: ${String(err)}`
        }

        // Truncate if over Discord's 2000 char limit
        const MAX_LEN = 2000
        if (content.length > MAX_LEN) {
          content = content.slice(0, MAX_LEN - 30) + '\n\n…(truncated, too long)'
        }

        // Send follow-up via Discord webhook
        try {
          const followUpRes = await fetch(followUpUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          })
          if (!followUpRes.ok) {
            console.error('Follow-up failed:', followUpRes.status, await followUpRes.text())
            // Try sending a short fallback so Discord stops "thinking..."
            await fetch(followUpUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: '⚠️ Response failed — please try again.' }),
            })
          }
        } catch (patchErr) {
          console.error('Follow-up PATCH threw:', String(patchErr))
          // Last-resort: send a short error so "thinking..." clears
          try {
            await fetch(followUpUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: '⚠️ An error occurred — please try again.' }),
            })
          } catch { /* nothing more we can do */ }
        }
    }

    try {
      if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
        c.executionCtx.waitUntil(runFollowUp())
      } else {
        // Best-effort: invoke async task without waitUntil
        void runFollowUp()
      }
    } catch (e) {
      // ensure we don't crash the request path
      void runFollowUp()
    }

    // type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE ("Bot is thinking...")
    return c.json({ type: 5 })
  }

  return c.text('Unhandled interaction type', 400)
})

export default app
