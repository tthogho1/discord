# Discord Gateway Bot (gateway)

This repo contains two things: a Cloudflare Worker (`src/index.ts`) for Discord Interactions, and a Gateway bot (`src/bot.ts`) using `discord.js`.

Quick start for the Gateway bot

1. Install dependencies

```bash
npm install
```

2. Set your bot token (or copy `.env.example`)

macOS / Linux:

```bash
export DISCORD_TOKEN="your_bot_token_here"
npm run start-bot
```

Or create a `.env` file with `DISCORD_TOKEN=...` and use a tool like `dotenv` when running.

3. Enable Message Content Intent

- Open the Discord Developer Portal → your Application → Bot
- Under "Privileged Gateway Intents" enable "Message Content Intent" if you need full message text

4. Invite the bot

Use OAuth2 URL with `bot` scope and required permissions (e.g. `Send Messages`, `Read Messages`). Example invite URL (replace CLIENT_ID):

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=8
```

Notes
- The bot uses `src/bot.ts` and logs message text in the console. The Cloudflare Worker in `src/index.ts` remains in the repo; keep or remove it depending on whether you want an interactions endpoint.
- If you want the bot to reply automatically or call the chat API used by the worker, I can integrate that logic into `src/bot.ts`.
