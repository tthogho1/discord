import { Hono } from 'hono'
import nacl from 'tweetnacl'

type Env = {
  DISCORD_PUBLIC_KEY: string
  HIGMA_API_BASE_URL: string
  SKIP_VERIFY?: string
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
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

  await next()
})

app.post('/', async (c) => {
  const raw = (c.req as any).__raw || (await c.req.text())
  try {
    const sig = c.req.header('x-signature-ed25519')
    const ts = c.req.header('x-signature-timestamp')
    const ct = c.req.header('content-type')
    console.info('askhigma_worker: x-signature-ed25519=', sig, 'x-signature-timestamp=', ts, 'content-type=', ct)
    console.info('askhigma_worker: raw=', raw)
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

    const appId = interaction.application_id
    const token = interaction.token

    // Return a deferred response immediately (Discord shows "thinking...")
    // Then use waitUntil to call HIGMA and send the follow-up
    const followUpUrl = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`

    c.executionCtx.waitUntil(
      (async () => {
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
      })()
    )

    // type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE ("Bot is thinking...")
    return c.json({ type: 5 })
  }

  return c.text('Unhandled interaction type', 400)
})

export default app
