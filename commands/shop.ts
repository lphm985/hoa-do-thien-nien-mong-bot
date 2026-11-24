import { EmbedBuilder, type Message } from "discord.js";
import type { CommandMeta } from "../commandLoader.js";
import { findItemByCodeOrName } from "../items.js";
import { getShopSnapshot } from "../shopPricing.js";
import { supabase } from "../supabase.js";

export const commandInfo: CommandMeta = {
  name: "shop",
  command: "!shop [buy <món> [sl] | sell <món> [sl]]",
  description:
    "Xem bảng giá shop biến động theo chu kỳ, mua vật phẩm bằng điểm hoặc bán vật phẩm lấy điểm (80% giá mua).",
};

function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}g ${m}p ${sec}s`;
  if (m > 0) return `${m}p ${sec}s`;
  return `${sec}s`;
}

export async function execute(message: Message): Promise<void> {
  const rawArgs = message.content
    .trim()
    .replace(/^!shop\b/i, "")
    .trim();

  const snapshot = await getShopSnapshot();

  // 1. Mua vật phẩm: !shop buy <tên_hoặc_mã> [số_lượng]
  const buyMatch = rawArgs.match(/^buy\s+(.+)$/i);
  if (buyMatch) {
    const rest = buyMatch[1].trim();
    const qtyMatch = rest.match(/^(.*?)\s+(\d+)$/);
    const query = (qtyMatch ? qtyMatch[1] : rest).trim();
    const qty = qtyMatch ? Math.max(1, Number.parseInt(qtyMatch[2], 10)) : 1;

    const itemDef = await findItemByCodeOrName(query);
    const shopItem = itemDef
      ? snapshot.items.find((i) => i.code === itemDef.code)
      : undefined;

    if (!itemDef || !shopItem || shopItem.buyPrice <= 0) {
      await message.reply(
        `Không tìm thấy vật phẩm \`${query}\` đang mở bán trong shop.`
      );
      return;
    }

    const { data, error } = await supabase.rpc("shop_buy_item", {
      p_discord_id: message.author.id,
      p_item_code: shopItem.code,
      p_quantity: qty,
      p_unit_price: shopItem.buyPrice,
    });

    if (error) {
      console.error("Lỗi mua shop:", error);
      await message.reply("Có lỗi khi giao dịch mua vật phẩm, thử lại sau nhé.");
      return;
    }

    const res = data as {
      ok?: boolean;
      reason?: string;
      total_cost?: number;
      current_points?: number;
      remaining_points?: number;
      new_quantity?: number;
    } | null;

    if (!res?.ok) {
      if (res?.reason === "not_enough_points") {
        await message.reply(
          `Không đủ điểm để mua **x${qty} ${shopItem.name}** (cần **${res.total_cost}** điểm, bạn hiện có **${res.current_points}** điểm).`
        );
        return;
      }
      await message.reply("Không thể thực hiện giao dịch mua lúc này.");
      return;
    }

    await message.reply(
      `🛒 Đã mua **x${qty} ${shopItem.name}** với giá **${shopItem.buyPrice}** điểm/món (tổng: **${res.total_cost}** điểm).\n` +
        `Trong kho hiện có: **x${res.new_quantity}** • Điểm còn lại: **${res.remaining_points}**.`
    );
    return;
  }

  // 2. Bán vật phẩm: !shop sell <tên_hoặc_mã> [số_lượng]
  const sellMatch = rawArgs.match(/^sell\s+(.+)$/i);
  if (sellMatch) {
    const rest = sellMatch[1].trim();
    const qtyMatch = rest.match(/^(.*?)\s+(\d+)$/);
    const query = (qtyMatch ? qtyMatch[1] : rest).trim();
    const qty = qtyMatch ? Math.max(1, Number.parseInt(qtyMatch[2], 10)) : 1;

    const itemDef = await findItemByCodeOrName(query);
    const shopItem = itemDef
      ? snapshot.items.find((i) => i.code === itemDef.code)
      : undefined;

    if (!itemDef || !shopItem || shopItem.sellPrice <= 0) {
      await message.reply(
        `Vật phẩm \`${query}\` hiện chưa được thiết lập giá bán trong shop.`
      );
      return;
    }

    const { data, error } = await supabase.rpc("shop_sell_item", {
      p_discord_id: message.author.id,
      p_item_code: shopItem.code,
      p_quantity: qty,
      p_unit_price: shopItem.sellPrice,
    });

    if (error) {
      console.error("Lỗi bán shop:", error);
      await message.reply("Có lỗi khi giao dịch bán vật phẩm, thử lại sau nhé.");
      return;
    }

    const res = data as {
      ok?: boolean;
      reason?: string;
      current_quantity?: number;
      total_gain?: number;
      remaining_points?: number;
      remaining_quantity?: number;
    } | null;

    if (!res?.ok) {
      if (res?.reason === "not_enough_items") {
        await message.reply(
          `Bạn không đủ **${shopItem.name}** trong kho để bán (hiện có **x${res.current_quantity ?? 0}**, cần **x${qty}**).`
        );
        return;
      }
      await message.reply("Không thể thực hiện giao dịch bán lúc này.");
      return;
    }

    await message.reply(
      `💰 Đã bán **x${qty} ${shopItem.name}** với giá **${shopItem.sellPrice}** điểm/món (nhận **+${res.total_gain}** điểm).\n` +
        `Kho còn: **x${res.remaining_quantity}** • Tổng điểm hiện tại: **${res.remaining_points}**.`
    );
    return;
  }

  // 3. Xem bảng shop: !shop
  const { data: statsRow } = await supabase
    .from("discord_pray_stats")
    .select("pray_points")
    .eq("discord_id", message.author.id)
    .maybeSingle();

  const userPoints = statsRow?.pray_points ?? 0;

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("Cửa Hàng — Hoạ Đồ Thiên Niên Mộng")
    .setDescription(
      `Điểm của bạn: **${userPoints}** • Đổi giá sau: **${formatCountdown(snapshot.secondsUntilNextCycle)}**\n` +
        `Giá bán mặc định = **80%** giá mua • Biến động: **${snapshot.config.randomItemCount}** món ngẫu nhiên (±**${snapshot.config.maxChangePercent}%**)`
    )
    .setFooter({
      text: "Mua: !shop buy <tên> [sl] • Bán: !shop sell <tên> [sl]",
      iconURL: message.client.user?.displayAvatarURL(),
    })
    .setTimestamp();

  if (snapshot.items.length === 0) {
    embed.addFields({
      name: "Trống",
      value:
        "Chưa có vật phẩm nào được đặt giá gốc (`base_price > 0`). Hãy vào Tab 3 của `/admin` để thiết lập nhé!",
    });
  } else {
    const lines = snapshot.items.slice(0, 20).map((it) => {
      const badge =
        it.changePercent > 0
          ? ` 📈 **+${it.changePercent}%**`
          : it.changePercent < 0
            ? ` 📉 **${it.changePercent}%**`
            : "";
      return `• **${it.name}** *(gốc: ${it.basePrice})* — Mua: **${it.buyPrice}** | Bán: **${it.sellPrice}**${badge}`;
    });

    embed.addFields({
      name: "Bảng giá hiện tại",
      value: lines.join("\n"),
      inline: false,
    });
  }

  await message.reply({ embeds: [embed] });
        }
