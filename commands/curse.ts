import type { Message } from "discord.js";
import { COOLDOWN_SECONDS, randomInt, supabase } from "../supabase.js";
export const commandInfo = {
  name: "curse",
  command: "!curse @user",
  description: "Nguyền rủa người được tag và trừ điểm ngẫu nhiên.",
};
// Đổi: export async function handleCurseCommand -> export async function execute

type PerformCurseResult = {
  allowed?: boolean;
  remaining_seconds?: number;
  target_points?: number;
};

const CURSE_MIN_LOSS = 5;
const CURSE_MAX_LOSS = 30;

// Sửa danh sách lời thoại nguyền rủa tại đây
const CURSE_LINES: string[] = [
  "Hắc khí quấn thân, lời nguyền của <@{caster}> giáng xuống <@{target}>!",
  "<@{caster}> niệm chú tà ác, <@{target}> bị hút cạn một phần linh lực!",
  "U Minh vọng tiếng, <@{target}> hứng trọn lời nguyền từ <@{caster}>!",
];

export async function execute(message: Message): Promise<void> {
  const targetUser = message.mentions.users.first();
  if (!targetUser) {
    await message.reply("Hãy tag người bạn muốn nguyền rủa, ví dụ: `!curse @ten`");
    return;
  }

  if (targetUser.id === message.author.id) {
    await message.reply("Bạn không thể tự nguyền rủa chính mình!");
    return;
  }

  if (targetUser.bot) {
    await message.reply("Bạn không thể nguyền rủa bot!");
    return;
  }

  const loss = randomInt(CURSE_MIN_LOSS, CURSE_MAX_LOSS);

  const { data, error } = await supabase.rpc("perform_curse", {
    p_caster_id: message.author.id,
    p_target_id: targetUser.id,
    p_loss: loss,
    p_cooldown_seconds: COOLDOWN_SECONDS,
  });

  if (error) {
    console.error("Lỗi gọi Supabase RPC perform_curse:", error);
    await message.reply("Có lỗi khi thực hiện lời nguyền, thử lại sau nhé.");
    return;
  }

  const row = data as PerformCurseResult | null;
  if (!row || !row.allowed) { 
	const waitSec = row?.remaining_seconds ?? COOLDOWN_SECONDS;
	await message.reply(
        `Bạn đang trong thời gian hồi chiêu, hãy đợi thêm **${waitSec}s** rồi mới \`!pray\` tiếp.`
      );
    return;
  }

  const template =
    CURSE_LINES[Math.floor(Math.random() * CURSE_LINES.length)];
  const line = template
    .replaceAll("{caster}", message.author.id)
    .replaceAll("{target}", targetUser.id);

  await message.reply(
    `${line}\n<@${targetUser.id}> bị trừ **-${loss}** điểm | Điểm còn lại: **${row.target_points}**`
  );
}
