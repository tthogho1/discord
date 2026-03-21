import { Client, GatewayIntentBits, Events } from 'discord.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.DISCORD_TOKEN!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

client.once(Events.ClientReady, () => {
  console.log(`${client.user?.tag} logged in!`);
});

client.on(Events.MessageCreate, async (message) => {
  console.log(`Received message: ${message.content} from ${message.author.tag}`);
  if (message.author.bot || !message.mentions.has(client.user!)) return;

  const prompt = message.content.replace(`<@${client.user!.id}>`, '').trim();
  if (!prompt) return;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }]
    });
    const reply = response.choices[0]?.message?.content?.slice(0, 2000) || 'No response';
    await message.reply(reply);
  } catch (error) {
    console.error(error);
    await message.reply('Error generating response.');
  }
});

client.login(token);
