# Discord Gateway Bot

A Discord gateway bot using `discord.js` that listens for mentions and replies via the Higma chat API.

## Quick start

1. Install dependencies

```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`)

```
DISCORD_TOKEN=your_bot_token_here
HIGMA_API_URL=https://tthogho1-higmachat.hf.space/api/chat
```

3. Run the bot

```bash
npm start
```

## Discord Developer Portal setup

- Open the Discord Developer Portal → your Application → Bot
- Under "Privileged Gateway Intents" enable **Message Content Intent**
- Use OAuth2 URL with `bot` scope to invite the bot (replace CLIENT_ID):

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=8
```

## Usage

Mention the bot in any channel message:

```
@higmachat What is TypeScript?
```

The bot will query the Higma chat API and reply with the answer.

## Worker: `/askhigma` interaction (Cloudflare)

This repository now includes a Cloudflare Worker endpoint that can handle Discord slash command interactions for `/askhigma`.

Setup summary:
- Add these secrets to your Worker via `wrangler secret put NAME` or set env vars in `wrangler.toml`:
	- `DISCORD_PUBLIC_KEY` (from Discord Developer Portal)
	- `HIGMA_API_BASE_URL` (your HIGMA API URL)
	- `HIGMA_API_KEY` (your HIGMA API key)
	- `HIGMA_MODEL` (optional)

- Register the command using Discord's application commands API (see spec in project root), then set the Interaction Endpoint URL to your deployed Worker URL.

- Deploy the Worker:

```bash
npx wrangler deploy
```

The Worker source is at `src/askhigma_worker.ts` and will verify Discord signatures, call the HIGMA API, and reply with HIGMA's response.
