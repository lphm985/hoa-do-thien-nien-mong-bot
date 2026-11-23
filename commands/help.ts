import { EmbedBuilder, type Message } from "discord.js";
import { getAllCommands, type CommandMeta } from "../commandLoader.js";

export const commandInfo: CommandMeta = {
  name: "help",
  command: "!help",
  description: "Xem bảng danh sách toàn bộ lệnh hiện có (tự động cập nhật A → Z).",
};

export async function execute(message: Message): Promise<void> {
  const commands = await getAllCommands();

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle("Bảng Lệnh — Hoạ Đồ Thiên Niên Mộng")
    .setThumbnail(message.client.user?.displayAvatarURL({ size: 256 }) ?? null)
    .setFooter({
      text: `Tổng cộng ${commands.length} lệnh • Sắp xếp A → Z`,
      iconURL: message.client.user?.displayAvatarURL(),
    })
    .setTimestamp();

  if (commands.length === 0) {
    embed.setDescription("Chưa tìm thấy lệnh nào trong thư mục `commands/`.");
  } else {
    embed.setDescription(
      "Dưới đây là toàn bộ các lệnh hiện có trong hệ thống:"
    );

    // Discord giới hạn tối đa 25 fields mỗi Embed
    const fields = commands.slice(0, 25).map((c) => {
      const aliasText =
        c.meta.aliases && c.meta.aliases.length > 0
          ? ` *(tên khác: ${c.meta.aliases.map((a) => `\`!${a}\``).join(", ")})*`
          : "";

      return {
        name: `\`${c.meta.command}\`${aliasText}`,
        value: c.meta.description || "Không có mô tả.",
        inline: false,
      };
    });

    embed.addFields(fields);
  }

  await message.reply({ embeds: [embed] });
}
