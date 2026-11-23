import type { Message } from "discord.js";
import { findItemByCodeOrName } from "../items.js";
import { supabase } from "../supabase.js";
export const commandInfo = {
  name: "give",
  command: "!give @user <item> [sl]",
  description: "Tặng vật phẩm từ kho của bạn cho người khác.",
};
// Đổi: export async function handleGiveCommand -> export async function execute

type TransferResult = {
  ok?: boolean;
  reason?: string;
  current_qty?: number;
  sender_qty?: number;
  receiver_qty?: number;
};

export async function execute(message: Message): Promise<void> {
  const targetUser = message.mentions.users.first();
  if (!targetUser) {
    await message.reply(
      "Cú pháp: `!give @nguoi_nhan <mã_hoặc_tên_vật_phẩm> [số_lượng]`\nVí dụ: `!give @ten linh_huong 2`"
    );
    return;
  }

  if (targetUser.id === message.author.id) {
    await message.reply("Bạn không thể tự tặng vật phẩm cho chính mình!");
    return;
  }

  if (targetUser.bot) {
    await message.reply("Bạn không thể tặng vật phẩm cho bot!");
    return;
  }

  // Bỏ phần prefix "!give" và phần mention <@id> hoặc <@!id>
  const withoutCmd = message.content
    .trim()
    .replace(/^!give\s+/i, "")
    .replace(/^<@!?\d+>\s*/, "")
    .trim();

  if (!withoutCmd) {
    await message.reply("Bạn chưa nhập vật phẩm muốn tặng. Ví dụ: `!give @ten linh_huong 1`");
    return;
  }

  // Nếu từ cuối cùng là số nguyên dương thì coi đó là số lượng
  const parts = withoutCmd.split(/\s+/);
  let quantity = 1;
  let itemQuery = withoutCmd;

  const lastPart = parts[parts.length - 1];
  if (parts.length > 1 && /^\d+$/.test(lastPart)) {
    quantity = Math.max(1, Number.parseInt(lastPart, 10));
    itemQuery = parts.slice(0, -1).join(" ");
  }

  const itemDef = await findItemByCodeOrName(itemQuery);
  if (!itemDef) {
    await message.reply(
      `Không tìm thấy vật phẩm \`${itemQuery}\`. Hãy kiểm tra lại tên hoặc mã trong \`!bag\`.`
    );
    return;
  }

  const { data, error } = await supabase.rpc("transfer_user_item", {
    p_sender_id: message.author.id,
    p_receiver_id: targetUser.id,
    p_item_code: itemDef.code,
    p_quantity: quantity,
  });

  if (error) {
    console.error("Lỗi gọi Supabase RPC transfer_user_item:", error);
    await message.reply("Có lỗi khi chuyển vật phẩm, thử lại sau nhé.");
    return;
  }

  const res = data as TransferResult | null;
  if (!res?.ok) {
    if (res?.reason === "insufficient_item") {
      await message.reply(
        `Bạn không đủ **${itemDef.name}** (hiện có **x${res.current_qty ?? 0}**, cần **x${quantity}**).`
      );
      return;
    }
    await message.reply("Không thể thực hiện tặng vật phẩm lúc này.");
    return;
  }

  await message.reply(
    `🎁 <@${message.author.id}> đã tặng **x${quantity} ${itemDef.name}** *[${itemDef.rarity}]* cho <@${targetUser.id}>!\nKho của bạn còn: **x${res.sender_qty}** | Kho của <@${targetUser.id}> có: **x${res.receiver_qty}**.`
  );
}
