import "dotenv/config";
import http from "node:http";
import { Client, GatewayIntentBits } from "discord.js";
import { handlePrayCommand } from "./commands/pray.js";
import { handleCurseCommand } from "./commands/curse.js";
import { handleHelpCommand } from "./commands/help.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", (readyClient) => {
  console.log(`Bot đã online: ${readyClient.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const lower = message.content.trim().toLowerCase();

  if (lower === "!help") {
    await handleHelpCommand(message);
    return;
  }

  if (lower === "!pray" || lower.startsWith("!pray ")) {
    await handlePrayCommand(message);
    return;
  }

  if (lower.startsWith("!curse")) {
    await handleCurseCommand(message);
  }
});

client.login(process.env.DISCORD_TOKEN);

// Giữ cổng HTTP để nền tảng hosting không tắt bot
const port = process.env.PORT || 3000;
http
  .createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot Hoa Do Thien Nien Mong dang hoat dong!");
  })
  .listen(port, () => {
    console.log(`Healthcheck server chạy tại cổng ${port}`);
  });
