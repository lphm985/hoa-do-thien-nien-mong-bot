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

type PerformPrayTargetResult = {
  allowed?: boolean;
  remaining_seconds?: number;
  target_points?: number;
};

// Lời thoại & điểm khi cầu nguyện cho bản thân (!pray)
const PRAY_OUTCOMES: PrayOutcome[] = [
  { text: "Hoạ Đồ đã chúc phúc cho bạn, linh khí tụ hội!", delta: 15 },
  { text: "Hoạ Đồ mỉm cười ban lộc, vận may mỉm cười với bạn.", delta: 25 },
  { text: "Hoạ Đồ từ chối chúc phúc cho bạn, khói hương tản mát.", delta: -10 },
  { text: "Hoạ Đồ khẽ lắc đầu, lời cầu nguyện chưa được hồi đáp.", delta: -5 },
  { text: "Đại cát! Hoạ Đồ giáng lâm ban phúc lành hiếm có!", delta: 50 },
];

// Lời thoại & điểm khi cầu nguyện cho người khác (!pray @ten)
const PRAY_FOR_OTHER_OUTCOMES: PrayOutcome[] = [
  {
    text: "<@{caster}> thắp hương cầu phúc cho <@{target}>, linh khí lan tỏa!",
    delta: 15,
  },
  {
    text: "<@{caster}> thành tâm khấn nguyện hộ <@{target}>, vận lành gõ cửa.",
    delta: 25,
  },
  {
    text: "<@{caster}> cầu nguyện cho <@{target}> nhưng khói hương tản đi mất.",
    delta: 0,
  },
  {
    text: "Lời khấn của <@{caster}> gửi tới <@{target}> chưa thấu tới thiên đình.",
    delta: 1,
  },
  {
    text: "Phúc giáng trùng trùng! Lời cầu của <@{caster}> mang đại cát đến <@{target}>!",
    delta: 50,
  },
];

export async function handlePrayCommand(message: Message): Promise<void> {
  const targetUser = message.mentions.users.first();

  // Trường hợp 1: Cầu nguyện cho bản thân (!pray)
  if (!targetUser) {
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
      return;
    }

    const sign = outcome.delta >= 0 ? `+${outcome.delta}` : `${outcome.delta}`;
    await message.reply(
      `${outcome.text}\nĐiểm thay đổi: **${sign}** | Tổng điểm cầu nguyện: **${row.new_points}**`
    );
    return;
  }

  // Trường hợp 2: Cầu nguyện cho người khác (!pray @ten)
  if (targetUser.id === message.author.id) {
    await message.reply("Cầu nguyện cho chính mình thì chỉ cần gõ `!pray` thôi nhé!");
    return;
  }

  if (targetUser.bot) {
    await message.reply("Bạn không thể cầu nguyện hộ bot!");
    return;
  }

  const outcome =
    PRAY_FOR_OTHER_OUTCOMES[
      Math.floor(Math.random() * PRAY_FOR_OTHER_OUTCOMES.length)
    ];

  const { data, error } = await supabase.rpc("perform_pray_target", {
    p_caster_id: message.author.id,
    p_target_id: targetUser.id,
    p_delta: outcome.delta,
    p_cooldown_seconds: COOLDOWN_SECONDS,
  });

  if (error) {
    console.error("Lỗi gọi Supabase RPC perform_pray_target:", error);
    await message.reply("Có lỗi khi lưu điểm cầu nguyện hộ, thử lại sau nhé.");
    return;
  }

  const row = data as PerformPrayTargetResult | null;
  if (!row || !row.allowed) {
    return;
  }

  const line = outcome.text
    .replaceAll("{caster}", message.author.id)
    .replaceAll("{target}", targetUser.id);
  const sign = outcome.delta >= 0 ? `+${outcome.delta}` : `${outcome.delta}`;

  await message.reply(
    `${line}\n<@${targetUser.id}> được thay đổi: **${sign}** điểm | Tổng điểm của <@${targetUser.id}>: **${row.target_points}**`
  );
}
