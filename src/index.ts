import { Hono } from 'hono'

type Env = {
  DISCORD_PUBLIC_KEY: string
}

type DiscordInteractionType = 1 | 2 | 3 | 4 | 5

type DiscordInteraction = {
  type: DiscordInteractionType
  token: string
  id: string
  data?: {
    name?: string
    options?: { name: string; value: string }[]
  }
}

type DiscordInteractionCallback = {
  type: number
  data?: {
    content?: string
  }
}

type ChatServerResponse = {
  answer: string
}

async function verifyDiscordRequest(req: Request, env: Env): Promise<boolean> {
  const signature = req.headers.get('X-Signature-Ed25519')
  const timestamp = req.headers.get('X-Signature-Timestamp')
  if (!signature || !timestamp) return false

  const body = await req.clone().text()
  const message = timestamp + body

  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(env.DISCORD_PUBLIC_KEY),
    { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' },
    false,
    ['verify']
  )

  return crypto.subtle.verify(
    'NODE-ED25519',
    key,
    hexToBytes(signature),
    new TextEncoder().encode(message)
  )
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

const app = new Hono<{ Bindings: Env }>()

app.post('/', async (c) => {
  const env = c.env

  if (!(await verifyDiscordRequest(c.req.raw, env))) {
    return c.text('invalid request signature', 401)
  }

  const interaction = (await c.req.json()) as DiscordInteraction

  // PING -> PONG
  if (interaction.type === 1) {
    return c.json({ type: 1 } as DiscordInteractionCallback)
  }

  // Application command (slash command)
  if (interaction.type === 2) {
    const query =
      interaction.data?.options?.[0]?.value?.toString() ?? 'No message provided.'

    const hfRes = await fetch('https://tthogho1-higmachat.hf.space/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })

    if (!hfRes.ok) {
      const errorText = await hfRes.text()
      return c.json({
        type: 4,
        data: { content: `Chat server error: ${hfRes.status} ${errorText}` },
      } as DiscordInteractionCallback)
    }

    const chatJson = (await hfRes.json()) as ChatServerResponse
    const answer = chatJson.answer ?? 'No answer from chat server.'

    return c.json({
      type: 4,
      data: { content: answer },
    } as DiscordInteractionCallback)
  }

  return c.text('Unhandled interaction type', 400)
})

export default app
