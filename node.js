require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel], // DM 必须
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    // 关键：先看事件有没有进来
    console.log(
      `[MessageCreate] guildId=${message.guildId} channelType=${message.channel?.type} authorBot=${message.author?.bot} content="${message.content}"`
    );

    if (message.author?.bot) return;

    // 只回复 DM
    if (message.guildId !== null) return;

    await message.reply("DM 收到 ✅：" + (message.content || "(empty)"));
  } catch (err) {
    console.error("Handler error:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);