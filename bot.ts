import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { handlePrayCommand } from "./commands/pray.js";
import { handleCurseCommand } from "./commands/curse.js";
import { handleHelpCommand } from "./commands/help.js";
import { handleStatsCommand } from "./commands/stats.js";
import { handleBagCommand } from "./commands/bag.js";
import { handleGiveCommand } from "./commands/give.js";
import { handleTradeCommand, handleTradeButton } from "./commands/trade.js";
import { startAdminAndHealthServer } from "./adminServer.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot đã online: ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
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
    return;
  }

  if (lower.startsWith("!give")) {
    await handleGiveCommand(message);
    return;
  }

  if (lower.startsWith("!trade")) {
    await handleTradeCommand(message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (
    interaction.customId.startsWith("trade_accept:") ||
    interaction.customId.startsWith("trade_decline:")
  ) {
    await handleTradeButton(interaction);
  }
});

client.login(process.env.DISCORD_TOKEN);
startAdminAndHealthServer();
