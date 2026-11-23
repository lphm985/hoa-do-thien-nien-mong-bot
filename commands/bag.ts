import { EmbedBuilder, type Message } from "discord.js";
import { getItemByCode } from "../items.js";
import { supabase } from "../supabase.js";
export const commandInfo = {
  name: "bag",
  aliases: ["inv"],
  command: "!bag [@user]",
  description: "Mở bảng kho đồ vật phẩm của bản thân hoặc người khác.",
};
// Đổi: export async function handleBagCommand -> export async function execute

type UserItemRow = {
  item_code: string;
  quantity: number;
};

export async function handleBagCommand(message: Message): Promise<void> {
  // Lấy người được tag nếu có, không có thì lấy chính người gửi lệnh
  const targetUser = message.mentions.users.first() ?? message.author;
  const member = message.guild?.members.cache.get(targetUser.id);
  const displayName = member?.displayName ?? targetUser.displayName;

  // Lấy danh sách vật phẩm đang có số lượng > 0 trong kho đồ trên Supabase
  const { data, error } = await supabase
    .from("discord_user_items")
    .select("item_code, quantity")
    .eq("discord_id", targetUser.id)
    .gt("quantity", 0);

  if (error) {
    console.error("Lỗi truy vấn kho đồ:", error);
    await message.reply("Có lỗi khi mở kho đồ, thử lại sau nhé.");
    return;
  }

  const rows = (data ?? []) as UserItemRow[];

  // Khởi tạo khung bảng (Embed) hiển thị trên Discord
  const embed = new EmbedBuilder()
    .setColor(0x38bdf8)
    .setTitle(`Kho Đồ — ${displayName}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setFooter({
      text: "Hoạ Đồ Thiên Niên Mộng",
      iconURL: message.client.user?.displayAvatarURL(),
    })
    .setTimestamp();

  if (rows.length === 0) {
    embed.setDescription(
      "Kho đồ hiện đang trống. Hãy thử `!pray` để cầu cơ duyên nhận vật phẩm!"
    );
  } else {
    // Ghép tên, độ hiếm và mô tả từ bảng vật phẩm trên Supabase cho từng món
    const fields = await Promise.all(
      rows.map(async (row) => {
        const def = await getItemByCode(row.item_code);
        return {
          name: def ? `${def.name} [${def.rarity}]` : row.item_code,
          value: `Số lượng: **x${row.quantity}**${
            def && def.description ? `\n*${def.description}*` : ""
          }`,
          inline: true,
        };
      })
    );

    embed.addFields(fields);
  }

  await message.reply({ embeds: [embed] });
}
