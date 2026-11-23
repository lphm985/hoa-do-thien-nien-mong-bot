import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { getAllCommands } from "./commandLoader.js";
import { startAdminAndHealthServer } from "./adminServer.js";

const PREFIX = "!";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (readyClient) => {
  const cmds = await getAllCommands(true);
  console.log(
    `Bot đã online: ${readyClient.user.tag} | Đã nạp tự động ${cmds.length} lệnh: ${cmds
      .map((c) => `!${c.meta.name}`)
      .join(", ")}`
  );
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const trimmed = message.content.trim();
  if (!trimmed.startsWith(PREFIX)) return;

  // Lấy từ khóa đầu tiên sau dấu "!" (vd: "!pray @ten" -> "pray")
  const firstToken = trimmed.slice(PREFIX.length).split(/\s+/)[0]?.toLowerCase();
  if (!firstToken) return;

  const commands = await getAllCommands();
  const matched = commands.find(
    (cmd) =>
      cmd.meta.name === firstToken || cmd.meta.aliases?.includes(firstToken)
  );

  if (matched) {
    await matched.execute(message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const commands = await getAllCommands();
  for (const cmd of commands) {
    if (
      cmd.handleButton &&
      cmd.buttonPrefixes?.some((prefix) => interaction.customId.startsWith(prefix))
    ) {
      await cmd.handleButton(interaction);
      return;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
startAdminAndHealthServer();
