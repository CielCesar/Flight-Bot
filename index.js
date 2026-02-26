require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
const { searchSeatsAeroCached } = require("./src/adapters/seatsAero");
const { getUserConfig, setUserConfig } = require("./src/configStore");
const { planQueryFromText } = require("./src/planner");
const { dummySearch } = require("./src/adapters/dummySearch");
const { formatResults } = require("./src/format");
const { TTLCache } = require("./src/cache");
const { searchAmadeusFlightOffers } = require("./src/adapters/amadeus");

const searchCache = new TTLCache(5 * 60 * 1000);

function cacheKey(q) {
  return `amadeus|${q.from}|${q.to}|${q.date}|${q.cabin}|${q.passengers}|${q.nonstop}`;
}

function isCommand(text) {
  return text && text.trim().startsWith("@");
}

function normalizeUserText(text) {
  return text
    // 1) 统一换行与空白
    .replace(/\r\n/g, "\n")
    // 2) 干掉零宽字符
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // 3) 把各种奇怪空格统一成普通空格
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    // 4) 合并多空格
    .replace(/\s+/g, " ")
    .trim()
    // 5) 三字母 token 统一大写（机场码）
    .replace(/\b([a-z]{3})\b/g, (m) => m.toUpperCase());
}

function parseCommand(text) {
  const t = text.trim();
  const [cmd, ...rest] = t.split(/\s+/);
  return { cmd: cmd.toLowerCase(), args: rest };
}

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds, // 不用也行，但留着不影响
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author?.bot) return;

    // 你只想要 DM：只处理 DM
    if (message.guildId !== null) return;

    const text = message.content?.trim() || "";
    if (!text) return;

    const userId = message.author.id;
    const cfg = getUserConfig(userId);

    // Commands
    if (isCommand(text)) {
      const { cmd, args } = parseCommand(text);

      if (cmd === "@help") {
        await message.reply(
          [
            "可用命令：",
            "- `@provider openai`",
            "- `@model gpt-4.1-mini`（或任意你有权限的 OpenAI 模型名）",
            "- `@show` 查看当前设置",
            "",
            "例子：",
            "`@provider openai`",
            "`@model gpt-4.1-mini`",
            "",
            "然后直接发：`下周三 SFO 去东京 商务舱 两个人`",
          ].join("\n")
        );
        return;
      }

      if (cmd === "@show") {
        await message.reply(`当前设置：provider=${cfg.provider}, model=${cfg.model}`);
        return;
      }

      if (cmd === "@provider") {
        const p = (args[0] || "").toLowerCase();
        if (!p) {
          await message.reply("用法：`@provider openai`");
          return;
        }
        if (p !== "openai") {
          await message.reply("M1 目前只接了 openai。后面再加 claude。");
          return;
        }
        setUserConfig(userId, { provider: "openai" });
        await message.reply(`OK ✅ provider=openai（model=${getUserConfig(userId).model}）`);
        return;
      }

      if (cmd === "@model") {
        const m = args[0];
        if (!m) {
          await message.reply("用法：`@model gpt-4.1-mini`");
          return;
        }
        setUserConfig(userId, { model: m });
        await message.reply(`OK ✅ model=${getUserConfig(userId).model}`);
        return;
      }

      await message.reply("不认识这个命令。发 `@help` 看用法。");
      return;
    }

    // Non-command: treat as flight query
    if (cfg.provider !== "openai") {
      await message.reply("当前只支持 openai provider。发 `@provider openai`。");
      return;
    }

    await message.channel.sendTyping();

    const normalizedUserText = normalizeUserText(text);
    const plan = await planQueryFromText(normalizedUserText, cfg);

    if (plan.type === "clarify") {
      await message.reply(plan.question);
      return;
    }

    // Placeholder search (M1 下一步换成 seats/pointsyah)
    const key = cacheKey(plan.queryParams);
    let results = searchCache.get(key);
    let cacheHit = false;

    if (results) {
      cacheHit = true;
    } else {
      results = await searchAmadeusFlightOffers(plan.queryParams);
      searchCache.set(key, results);
    }

    const out = formatResults(plan.queryParams, results, { cacheHit, userText: normalizedUserText });
    await message.reply(out);
  } catch (err) {
    console.error("Bot error:", err);
    await message.reply("出错了（我这边有日志）。你把刚才那句话再发一次试试？");
  }
});

client.login(process.env.DISCORD_TOKEN);