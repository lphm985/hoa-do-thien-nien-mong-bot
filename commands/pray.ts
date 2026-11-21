import type { Message } from "discord.js";
import { COOLDOWN_SECONDS, supabase } from "../supabase.js";

type PrayOutcome = {
  text: string;
  delta: number;
};

type PerformPrayResult = {
  allowed?: boolean;
  remaining_seconds?: number;
  new_points?: number;
};

// Sửa danh sách lời thoại và điểm cộng/trừ tại đây
const PRAY_OUTCOMES: PrayOutcome[] = [
  { text: "Họa Đồ đã chúc phúc cho bạn, linh khí tụ hội!", delta: 15 },
  { text: "Họa Đồ mỉm cười ban lộc, vận may mỉm cười với bạn.", delta: 25 },
  { text: "Họa Đồ từ chối chúc phúc cho bạn, khói hương tản mát.", delta: -10 },
  { text: "Họa Đồ khẽ lắc đầu, lời cầu nguyện chưa được hồi đáp.", delta: -5 },
  { text: "Đại cát! Họa Đồ giáng lâm ban phúc lành hiếm có!", delta: 50 },
];

export async function handlePrayCommand(message: Message): Promise<void> {
  const outcome =
    PRAY_OUTCOMES[Math.floor(Math.random() * PRAY_OUTCOMES.length)];

  const { data, error } = await supabase.rpc("perform_pray", {
    p_discord_id: message.author.id,
    p_delta: outcome.delta,
    p_cooldown_seconds: COOLDOWN_SECONDS,
  });

  if (error) {
    console.error("Lỗi gọi Supabase RPC perform_pray:", error);
    await message.reply("Có lỗi khi lưu điểm cầu nguyện, thử lại sau nhé.");
    return;
  }

  const row = data as PerformPrayResult | null;
  if (!row || !row.allowed) {
	const waitSec = row?.remaining_seconds ?? COOLDOWN_SECONDS;
	await message.reply(
        `Bạn đang trong thời gian hồi chiêu, hãy đợi thêm **${waitSec}s** rồi mới \`!pray\` tiếp.`
      );
    return;
  }

  const sign = outcome.delta >= 0 ? `+${outcome.delta}` : `${outcome.delta}`;
  await message.reply(
    `${outcome.text}\nĐiểm thay đổi: **${sign}** | Tổng điểm cầu nguyện: **${row.new_points}**`
  );
}