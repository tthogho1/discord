console.log('Starting src/bot.ts');
import { Client, GatewayIntentBits } from 'discord.js';
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('Environment variable DISCORD_TOKEN is required');
    process.exit(1);
}
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});
client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}`);
});
client.on('messageCreate', async (message) => {
    if (message.author.bot)
        return;
    console.log(`Message from ${message.author.tag}: ${message.content}`);
    // Call the chat API (same one used by the Cloudflare Worker)
    async function queryChatServer(query) {
        try {
            const res = await fetch('https://tthogho1-higmachat.hf.space/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                console.error('Chat server error:', res.status, errorText);
                return `Chat server error: ${res.status}`;
            }
            const json = (await res.json());
            return json.answer ?? 'No answer from chat server.';
        }
        catch (err) {
            console.error('Failed to contact chat server:', err);
            return 'Error contacting chat server.';
        }
    }
    const answer = await queryChatServer(message.content ?? '');
    try {
        await message.reply(answer);
    }
    catch (replyErr) {
        console.error('Failed to send reply:', replyErr);
    }
});
client.login(token);
