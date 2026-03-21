console.log('Starting src/bot.ts')

import { Client, GatewayIntentBits } from 'discord.js'

const token = process.env.DISCORD_TOKEN
if (!token) {
  console.error('Environment variable DISCORD_TOKEN is required')
  process.exit(1)
}

const chatApiUrl = process.env.HIGMA_API_URL
if (!chatApiUrl) {
  console.error('Environment variable HIGMA_API_URL is required')
  process.exit(1)
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`)
})

client.on('messageCreate', async (message) => {
  if (message.author.bot) return

  // Only respond when the bot is mentioned
  if (!client.user || !message.mentions.has(client.user)) return

  // Strip the mention from the message to get the actual query
  const query = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim()

  console.log(`Mention from ${message.author.tag}: ${query}`)

  if (!query) {
    await message.reply('Please include a message after mentioning me!')
    return
  }

  // Call the chat API (same one used by the Cloudflare Worker)
  async function queryChatServer(query: string) {
    try {
      const res = await fetch(chatApiUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        console.error('Chat server error:', res.status, errorText)
        return `Chat server error: ${res.status}`
      }

      const json = (await res.json()) as { answer?: string }
      return json.answer ?? 'No answer from chat server.'
    } catch (err) {
      console.error('Failed to contact chat server:', err)
      return 'Error contacting chat server.'
    }
  }

  const answer = await queryChatServer(message.content ?? '')
  try {
    await message.reply(answer)
  } catch (replyErr) {
    console.error('Failed to send reply:', replyErr)
  }
})

client.login(token)
