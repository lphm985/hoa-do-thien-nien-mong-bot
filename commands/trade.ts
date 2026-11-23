import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { findItemByCodeOrName, getItemByCode } from "../items.js";
import { supabase } from "../supabase.js";
export const commandInfo = {
  name: "trade",
  command: "!trade @user <món_bạn> [sl1] <món_họ> [sl2]",
  description: "Đề nghị trao đổi vật phẩm 2 chiều (cần đối phương bấm Đồng ý).",
};

export const buttonPrefixes = [
  "trade_accept:",
  "trade_decline:",
  "trade_cancel:",
];
// Đổi: export async function handleTradeCommand -> export async function execute
// Đổi: export async function handleTradeButton -> export async function handleButton

const TRADE_TIMEOUT_SECONDS = 30;

type TradeRow = {
  id: string;
  requester_id: string;
  target_id: string;
  offer_item_code: string;
  offer_quantity: number;
  request_item_code: string;
  request_quantity: number;
  status: string;
  expires_at: string;
};

type AcceptTradeResult = {
  ok?: boolean;
  reason?: string;
  status?: string;
};

type ParsedSide = {
  itemCode: string;
  quantity: number;
};

function parseTwoTradeSides(raw: string): { left: ParsedSide; right: ParsedSide } | null {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  const firstNumIdx = tokens.findIndex((t, idx) => idx > 0 && /^\d+$/.test(t));

  let leftQuery = "";
  let leftQty = 1;
  let rightTokens: string[] = [];

  if (firstNumIdx !== -1) {
    leftQuery = tokens.slice(0, firstNumIdx).join(" ");
    leftQty = Math.max(1, Number.parseInt(tokens[firstNumIdx], 10));
    rightTokens = tokens.slice(firstNumIdx + 1);
  } else {
    leftQuery = tokens[0];
    leftQty = 1;
    rightTokens = tokens.slice(1);
  }

  if (!leftQuery || rightTokens.length === 0) return null;

  let rightQty = 1;
  let rightQuery = rightTokens.join(" ");
  const lastToken = rightTokens[rightTokens.length - 1];
  if (rightTokens.length > 1 && /^\d+$/.test(lastToken)) {
    rightQty = Math.max(1, Number.parseInt(lastToken, 10));
    rightQuery = rightTokens.slice(0, -1).join(" ");
  }

  if (!rightQuery) return null;

  return {
    left: { itemCode: leftQuery, quantity: leftQty },
    right: { itemCode: rightQuery, quantity: rightQty },
  };
}

export async function execute(message: Message): Promise<void> {
  const targetUser = message.mentions.users.first();
  if (!targetUser) {
    await message.reply(
      "Cú pháp: `!trade @nguoi_doi <món_của_bạn> [sl1] <món_của_họ> [sl2]`\nVí dụ: `!trade @ten linh_huong 1 ngoc_boi_van_khi 1`"
    );
    return;
  }

  if (targetUser.id === message.author.id) {
    await message.reply("Bạn không thể tự trao đổi với chính mình!");
    return;
  }

  if (targetUser.bot) {
    await message.reply("Bạn không thể trao đổi vật phẩm với bot!");
    return;
  }

  // 1. Dọn các lời mời quá hạn trước khi kiểm tra trùng lời mời đang chờ
  const nowIso = new Date().toISOString();
  await supabase
    .from("discord_trade_offers")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  // 2. Chỉ cho phép tồn tại 1 lời mời đang chờ tại mỗi thời điểm
  const { data: activeTrades } = await supabase
    .from("discord_trade_offers")
    .select("id, requester_id, target_id, expires_at")
    .eq("status", "pending")
    .or(
      `requester_id.eq.${message.author.id},target_id.eq.${message.author.id},requester_id.eq.${targetUser.id},target_id.eq.${targetUser.id}`
    )
    .limit(1);

  if (activeTrades && activeTrades.length > 0) {
    const existing = activeTrades[0];
    const remain = Math.max(
      1,
      Math.ceil((new Date(existing.expires_at).getTime() - Date.now()) / 1000)
    );
    if (
      existing.requester_id === message.author.id ||
      existing.target_id === message.author.id
    ) {
      await message.reply(
        `Bạn đang có 1 giao dịch chưa kết thúc (tự hủy sau **${remain}s**). Hãy hoàn tất hoặc bấm **Hủy lời mời** trước khi tạo lời mời mới!`
      );
    } else {
      await message.reply(
        `<@${targetUser.id}> đang bận trong 1 giao dịch khác (tự hủy sau **${remain}s**), vui lòng đợi một lát!`
      );
    }
    return;
  }

  const rest = message.content
    .trim()
    .replace(/^!trade\s+/i, "")
    .replace(/^<@!?\d+>\s*/, "")
    .trim();

  const parsed = parseTwoTradeSides(rest);
  if (!parsed) {
    await message.reply(
      "Thiếu thông tin vật phẩm trao đổi. Ví dụ: `!trade @ten linh_huong 1 ngoc_boi_van_khi 1`"
    );
    return;
  }

  const offerDef = await findItemByCodeOrName(parsed.left.itemCode);
  const requestDef = await findItemByCodeOrName(parsed.right.itemCode);

  if (!offerDef) {
    await message.reply(`Không tìm thấy vật phẩm bạn muốn đưa: \`${parsed.left.itemCode}\`.`);
    return;
  }
  if (!requestDef) {
    await message.reply(`Không tìm thấy vật phẩm bạn muốn nhận: \`${parsed.right.itemCode}\`.`);
    return;
  }

  // Kiểm tra sơ bộ số lượng vật phẩm của 2 bên
  const { data: reqItem } = await supabase
    .from("discord_user_items")
    .select("quantity")
    .eq("discord_id", message.author.id)
    .eq("item_code", offerDef.code)
    .maybeSingle();

  if ((reqItem?.quantity ?? 0) < parsed.left.quantity) {
    await message.reply(
      `Bạn không đủ **${offerDef.name}** để trao đổi (hiện có **x${reqItem?.quantity ?? 0}**, cần **x${parsed.left.quantity}**).`
    );
    return;
  }

  const { data: tgtItem } = await supabase
    .from("discord_user_items")
    .select("quantity")
    .eq("discord_id", targetUser.id)
    .eq("item_code", requestDef.code)
    .maybeSingle();

  if ((tgtItem?.quantity ?? 0) < parsed.right.quantity) {
    await message.reply(
      `<@${targetUser.id}> hiện không đủ **${requestDef.name}** (chỉ có **x${tgtItem?.quantity ?? 0}**, cần **x${parsed.right.quantity}**).`
    );
    return;
  }

  // Tạo lời mời có hiệu lực 30 giây
  const expiresAt = new Date(
    Date.now() + TRADE_TIMEOUT_SECONDS * 1000
  ).toISOString();

  const { data: inserted, error } = await supabase
    .from("discord_trade_offers")
    .insert({
      requester_id: message.author.id,
      target_id: targetUser.id,
      offer_item_code: offerDef.code,
      offer_quantity: parsed.left.quantity,
      request_item_code: requestDef.code,
      request_quantity: parsed.right.quantity,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("Lỗi tạo lời mời trade:", error);
    await message.reply("Có lỗi khi tạo lời mời trao đổi, thử lại sau nhé.");
    return;
  }

  const tradeId = inserted.id as string;

  const embed = new EmbedBuilder()
    .setColor(0xa855f7)
    .setTitle("Lời Mời Trao Đổi Vật Phẩm")
    .setDescription(
      `<@${message.author.id}> muốn trao đổi với <@${targetUser.id}>.\nLời mời sẽ **tự động tiêu hủy sau ${TRADE_TIMEOUT_SECONDS} giây** nếu chưa được xác nhận.`
    )
    .addFields(
      {
        name: "Bên đề nghị đưa ra",
        value: `<@${message.author.id}>\n**x${parsed.left.quantity} ${offerDef.name}** *[${offerDef.rarity}]*`,
        inline: true,
      },
      {
        name: "Yêu cầu nhận lại",
        value: `<@${targetUser.id}>\n**x${parsed.right.quantity} ${requestDef.name}** *[${requestDef.rarity}]*`,
        inline: true,
      }
    )
    .setFooter({ text: `Hiệu lực ${TRADE_TIMEOUT_SECONDS}s • Mã: ${tradeId}` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade_accept:${tradeId}`)
      .setLabel("Đồng ý")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`trade_decline:${tradeId}`)
      .setLabel("Từ chối")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`trade_cancel:${tradeId}`)
      .setLabel("Hủy lời mời")
      .setStyle(ButtonStyle.Secondary)
  );

  const sentMessage = await message.reply({
    content: `<@${targetUser.id}>`,
    embeds: [embed],
    components: [row],
  });

  // Tự động tiêu hủy sau 30 giây nếu vẫn đang pending
  setTimeout(async () => {
    try {
      const { data: expiredRow } = await supabase
        .from("discord_trade_offers")
        .update({ status: "expired" })
        .eq("id", tradeId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      // Chỉ cập nhật tin nhắn nếu đúng là lời mời vừa bị hết hạn ở giây thứ 30
      if (expiredRow) {
        const expiredEmbed = EmbedBuilder.from(embed)
          .setColor(0x64748b)
          .setTitle("Lời Mời Trao Đổi Đã Tiêu Hủy (Hết 30s)");

        await sentMessage.edit({
          content: `⌛ Lời mời trao đổi giữa <@${message.author.id}> và <@${targetUser.id}> đã tự động tiêu hủy do quá **${TRADE_TIMEOUT_SECONDS} giây** không phản hồi.`,
          embeds: [expiredEmbed],
          components: [],
        });
      }
    } catch (err) {
      console.error("Lỗi khi tự động tiêu hủy lời mời trade:", err);
    }
  }, TRADE_TIMEOUT_SECONDS * 1000);
}

// Xử lý bấm nút Đồng ý / Từ chối / Hủy lời mời
export async function handleTradeButton(
  interaction: ButtonInteraction
): Promise<void> {
  const [action, tradeId] = interaction.customId.split(":");
  if (
    !tradeId ||
    (action !== "trade_accept" &&
      action !== "trade_decline" &&
      action !== "trade_cancel")
  ) {
    return;
  }

  const { data: tradeData, error: fetchErr } = await supabase
    .from("discord_trade_offers")
    .select("*")
    .eq("id", tradeId)
    .maybeSingle();

  if (fetchErr || !tradeData) {
    await interaction.reply({
      content: "Không tìm thấy lời mời trao đổi này.",
      ephemeral: true,
    });
    return;
  }

  const trade = tradeData as TradeRow;

  if (trade.status !== "pending") {
    await interaction.reply({
      content: "Lời mời trao đổi này đã kết thúc hoặc đã bị tiêu hủy.",
      ephemeral: true,
    });
    return;
  }

  // Kiểm tra quá hạn 30s ngay lúc bấm nút
  if (Date.now() > new Date(trade.expires_at).getTime()) {
    await supabase
      .from("discord_trade_offers")
      .update({ status: "expired" })
      .eq("id", tradeId)
      .eq("status", "pending");

    await interaction.update({
      content: `⌛ Lời mời trao đổi đã tự động tiêu hủy do quá **${TRADE_TIMEOUT_SECONDS} giây**.`,
      components: [],
    });
    return;
  }

  // Trường hợp 1: Người gửi bấm "Hủy lời mời"
  if (action === "trade_cancel") {
    if (interaction.user.id !== trade.requester_id) {
      await interaction.reply({
        content: `Chỉ người gửi (<@${trade.requester_id}>) mới có thể hủy lời mời này.`,
        ephemeral: true,
      });
      return;
    }

    await supabase
      .from("discord_trade_offers")
      .update({ status: "cancelled" })
      .eq("id", tradeId)
      .eq("status", "pending");

    await interaction.update({
      content: `🚫 <@${trade.requester_id}> đã **hủy** lời mời trao đổi với <@${trade.target_id}>.`,
      components: [],
    });
    return;
  }

  // Trường hợp 2 & 3: Chỉ người được mời (target_id) mới được bấm Đồng ý hoặc Từ chối
  if (interaction.user.id !== trade.target_id) {
    await interaction.reply({
      content: `Chỉ <@${trade.target_id}> mới có quyền Đồng ý hoặc Từ chối lời mời này.`,
      ephemeral: true,
    });
    return;
  }

  if (action === "trade_decline") {
    await supabase
      .from("discord_trade_offers")
      .update({ status: "declined" })
      .eq("id", tradeId)
      .eq("status", "pending");

    await interaction.update({
      content: `❌ <@${trade.target_id}> đã **từ chối** lời mời trao đổi của <@${trade.requester_id}>.`,
      components: [],
    });
    return;
  }

  // Bấm Đồng ý -> gọi RPC chốt giao dịch nguyên tử
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "accept_trade_offer",
    {
      p_trade_id: tradeId,
      p_actor_id: interaction.user.id,
    }
  );

  if (rpcErr) {
    console.error("Lỗi gọi RPC accept_trade_offer:", rpcErr);
    await interaction.reply({
      content: "Có lỗi khi hoàn tất trao đổi, thử lại sau nhé.",
      ephemeral: true,
    });
    return;
  }

  const res = rpcData as AcceptTradeResult | null;
  if (!res?.ok) {
    const reasonMap: Record<string, string> = {
      expired: `Lời mời trao đổi đã hết hạn sau ${TRADE_TIMEOUT_SECONDS} giây.`,
      already_closed: "Lời mời trao đổi này đã được xử lý hoặc đã hủy trước đó.",
      requester_missing_item: `<@${trade.requester_id}> hiện không còn đủ vật phẩm để giao dịch.`,
      target_missing_item: "Bạn hiện không còn đủ vật phẩm để hoàn tất trao đổi.",
    };
    await interaction.reply({
      content: reasonMap[res?.reason ?? ""] ?? "Không thể hoàn tất giao dịch lúc này.",
      ephemeral: true,
    });
    return;
  }

  const offerDef = await getItemByCode(trade.offer_item_code);
  const requestDef = await getItemByCode(trade.request_item_code);
  const offerName = offerDef?.name ?? trade.offer_item_code;
  const requestName = requestDef?.name ?? trade.request_item_code;

  await interaction.update({
    content: `✅ **Trao đổi thành công!**\n• <@${trade.requester_id}> nhận **x${trade.request_quantity} ${requestName}** và giao **x${trade.offer_quantity} ${offerName}**.\n• <@${trade.target_id}> nhận **x${trade.offer_quantity} ${offerName}** và giao **x${trade.request_quantity} ${requestName}**.`,
    components: [],
  });
}
