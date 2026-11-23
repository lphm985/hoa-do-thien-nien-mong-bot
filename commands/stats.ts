import { EmbedBuilder, type Message } from "discord.js";
import { supabase } from "../supabase.js";

type PrayStatsRow = {
  discord_id: string;
  pray_points: number;
};

export async function handleStatsCommand(message: Message): Promise<void> {
  const targetUser = message.mentions.users.first() ?? message.author;
  const member = message.guild?.members.cache.get(targetUser.id);

  // Ưu tiên tên hiển thị trong server, nếu không có thì lấy tên hiển thị chung
  const displayName = member?.displayName ?? targetUser.displayName;
  const avatarUrl = targetUser.displayAvatarURL({ size: 256 });

  const { data, error } = await supabase
    .from("discord_pray_stats")
    .select("discord_id, pray_points")
    .eq("discord_id", targetUser.id)
    .maybeSingle();

  if (error) {
    console.error("Lỗi truy vấn Supabase trong !stats:", error);
    await message.reply("Có lỗi khi tải thông tin người dùng, thử lại sau nhé.");
    return;
  }

  const row = data as PrayStatsRow | null;
  const totalPoints = row?.pray_points ?? 0;

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`Hồ Sơ Đạo Hữu — ${displayName}`)
    .setThumbnail(avatarUrl)
    .addFields(
      {
        name: "Đạo hiệu",
        value: `<@${targetUser.id}>`,
        inline: true,
      },
      {
        name: "Điểm cầu nguyện",
        value: `**${totalPoints}**`,
        inline: true,
      }
      // Sau này nghĩ ra chỉ số mới (vd: Cảnh giới, Linh thạch, Danh hiệu...),
      // chỉ cần thêm tiếp object { name: "...", value: "...", inline: true } vào đây
    )
    .setFooter({
      text: "Hoạ Đồ Thiên Niên Mộng",
      iconURL: message.client.user?.displayAvatarURL(),
    })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}
