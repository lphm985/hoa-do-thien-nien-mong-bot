import type { Message } from "discord.js";
import { getAllCommands, type CommandMeta } from "../commandLoader.js";

export const commandInfo: CommandMeta = {
  name: "help",
  command: "!help",
  description: "Xem danh sách toàn bộ lệnh hiện có (tự động cập nhật A → Z).",
};

export async function execute(message: Message): Promise<void> {
  const commands = await getAllCommands();

  if (commands.length === 0) {
    await message.reply("Chưa tìm thấy lệnh nào trong thư mục `commands/`.");
    return;
  }

  const lines = commands.map(
    (c) => `• \`${c.meta.command}\` — ${c.meta.description}`
  );

  await message.reply(
    `**Danh sách lệnh của Hoạ Đồ Thiên Niên Mộng (A → Z):**\n${lines.join("\n")}`
  );
}
