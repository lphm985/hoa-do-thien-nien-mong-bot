import { EmbedBuilder, type Message } from "discord.js";
import { getAllCommands, type CommandMeta } from "../commandLoader.js";

export const commandInfo: CommandMeta = {
  name: "help",
  command: "!help [tên_lệnh]",
  description:
    "Xem danh sách lệnh gọn (A → Z) hoặc gõ !help <tên_lệnh> để xem mô tả chi tiết của lệnh đó.",
};

export async function execute(message: Message): Promise<void> {
  const commands = await getAllCommands();
  const queryRaw = message.content
    .trim()
    .replace(/^!help\b/i, "")
    .trim()
    .replace(/^!/, "")
    .toLowerCase();

  // Nhánh 1: Xem chi tiết 1 lệnh cụ thể (!help <tên_lệnh>)
  if (queryRaw) {
    const matched = commands.find((c) => {
      const baseName = c.meta.name.toLowerCase();
      const cmdFirstToken = c.meta.command
        .trim()
        .replace(/^!/, "")
        .split(/\s+/)[0]
        ?.toLowerCase();
      const aliasList = (c.meta.aliases ?? []).map((a) => a.toLowerCase());
      return (
        baseName === queryRaw ||
        cmdFirstToken === queryRaw ||
        aliasList.includes(queryRaw)
      );
    });

    if (!matched) {
      await message.reply(
        `Không tìm thấy lệnh \`!${queryRaw}\`. Gõ \`!help\` để xem danh sách lệnh hiện có.`
      );
      return;
    }

    const detailEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle(`Chi Tiết Lệnh — !${matched.meta.name}`)
      .setDescription(matched.meta.description || "Không có mô tả.")
      .addFields({
        name: "Cú pháp",
        value: `\`${matched.meta.command}\``,
        inline: true,
      });

    if (matched.meta.aliases && matched.meta.aliases.length > 0) {
      detailEmbed.addFields({
        name: "Tên gọi khác",
        value: matched.meta.aliases.map((a) => `\`!${a}\``).join(", "),
        inline: true,
      });
    }

    detailEmbed
      .setFooter({
        text: "Hoạ Đồ Thiên Niên Mộng",
        iconURL: message.client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    await message.reply({ embeds: [detailEmbed] });
    return;
  }

  // Nhánh 2: Bảng danh sách lệnh gọn (A -> Z), chỉ hiện lệnh & xóa mô tả
  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle("Danh Sách Lệnh — Hoạ Đồ Thiên Niên Mộng")
    .setThumbnail(message.client.user?.displayAvatarURL({ size: 256 }) ?? null)
    .setFooter({
      text: `${commands.length} lệnh • Gõ !help <tên_lệnh> để xem chi tiết`,
      iconURL: message.client.user?.displayAvatarURL(),
    })
    .setTimestamp();

  if (commands.length === 0) {
    embed.setDescription("Chưa tìm thấy lệnh nào trong thư mục `commands/`.");
  } else {
    const listText = commands
      .map((c) => `• \`!${c.meta.name}\``)
      .join("\n");
    embed.setDescription(listText);
  }

  await message.reply({ embeds: [embed] });
}
