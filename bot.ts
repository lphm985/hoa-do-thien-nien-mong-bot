import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { handlePrayCommand } from "./commands/pray.js";
import { handleCurseCommand } from "./commands/curse.js";

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

  if (lower === "!pray") {
    await handlePrayCommand(message);
    return;
  }

  if (lower.startsWith("!curse")) {
    await handleCurseCommand(message);
  }
});

client.login(process.env.DISCORD_TOKEN);