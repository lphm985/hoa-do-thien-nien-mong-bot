import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { handlePrayCommand } from "./commands/pray.js";
import { handleCurseCommand } from "./commands/curse.js";
import { handleHelpCommand } from "./commands/help.js";
import { handleStatsCommand } from "./commands/stats.js";
import { handleBagCommand } from "./commands/bag.js";
import { startAdminAndHealthServer } from "./adminServer.js";

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
    return;
  }

  if (lower === "!stats" || lower.startsWith("!stats ")) {
    await handleStatsCommand(message);
    return;
  }

  if (lower === "!bag" || lower.startsWith("!bag ")) {
    await handleBagCommand(message);
  }
});

client.login(process.env.DISCORD_TOKEN);
startAdminAndHealthServer();
