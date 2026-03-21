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
