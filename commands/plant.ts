import { EmbedBuilder, type Message } from "discord.js";
import type { CommandMeta } from "../commandLoader.js";
import { findItemByCodeOrName, getItemByCode } from "../items.js";
import { supabase } from "../supabase.js";

export const commandInfo: CommandMeta = {
  name: "plant",
  aliases: ["farm"],
  command: "!plant [stt | unlock | info <stt>]",
  description:
    "Xem bảng ruộng (✅/❌), kiểm tra chi tiết từng ô, mở khóa ruộng bằng điểm hoặc gieo hạt giống (vd: !plant 1-3,5 thanh thuy hat).",
};

const MAX_PLOTS = 10;

type PlotRow = {
  plot_index: number;
  seed_item_code: string | null;
  planted_at: string | null;
  ready_at: string | null;
};

type UnlockResult = {
  ok?: boolean;
  reason?: string;
  unlocked?: number;
  cost?: number;
  current_points?: number;
  remaining_points?: number;
  next_plot?: number;
};

type PlantResult = {
  ok?: boolean;
  reason?: string;
  planted?: number[];
  skipped?: string[];
  remaining_seeds?: number;
  grow_seconds?: number;
};

// Phân tích chuỗi STT ruộng hỗ trợ cả chuỗi (1-4) và ngắt quãng (1,3,5)
function parsePlotIndices(spec: string): number[] | null {
  const cleaned = spec.replace(/\s+/g, "");
  if (!/^[0-9,-]+$/.test(cleaned)) return null;

  const result = new Set<number>();
  const segments = cleaned.split(",").filter(Boolean);
  if (segments.length === 0) return null;

  for (const seg of segments) {
    if (seg.includes("-")) {
      const bounds = seg.split("-");
      if (bounds.length !== 2 || !bounds[0] || !bounds[1]) return null;
      const start = Number.parseInt(bounds[0], 10);
      const end = Number.parseInt(bounds[1], 10);
      if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end < start || end > 50) {
        return null;
      }
      for (let i = start; i <= end; i++) {
        result.add(i);
      }
    } else {
      const num = Number.parseInt(seg, 10);
      if (Number.isNaN(num) || num < 1 || num > 50) return null;
      result.add(num);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}g ${m}p ${sec}s`;
  if (m > 0) return `${m}p ${sec}s`;
  return `${sec}s`;
}

async function getUserFarmState(discordId: string): Promise<{
  unlockedPlots: number;
  plotsMap: Map<number, PlotRow>;
}> {
  await supabase
    .from("discord_user_farms")
    .upsert({ discord_id: discordId, unlocked_plots: 2 }, { onConflict: "discord_id", ignoreDuplicates: true });

  const [{ data: farmData }, { data: plotsData }] = await Promise.all([
    supabase
      .from("discord_user_farms")
      .select("unlocked_plots")
      .eq("discord_id", discordId)
      .maybeSingle(),
    supabase
      .from("discord_farm_plots")
      .select("plot_index, seed_item_code, planted_at, ready_at")
      .eq("discord_id", discordId)
      .order("plot_index", { ascending: true }),
  ]);

  const unlockedPlots = farmData?.unlocked_plots ?? 2;
  const plotsMap = new Map<number, PlotRow>();
  for (const row of (plotsData ?? []) as PlotRow[]) {
    plotsMap.set(row.plot_index, row);
  }

  return { unlockedPlots, plotsMap };
}

export async function execute(message: Message): Promise<void> {
  const rawArgs = message.content.trim().replace(/^!(plant|farm)\b/i, "").trim();

  // Trường hợp 1: Gõ !plant (không tham số) -> Hiện bảng trạng thái ruộng theo từng hàng
  if (!rawArgs) {
    const { unlockedPlots, plotsMap } = await getUserFarmState(message.author.id);
    const now = Date.now();

    const rowsText: string[] = [];
    for (let i = 1; i <= MAX_PLOTS; i++) {
      if (i > unlockedPlots) {
        const unlockCost = (i - 1) * 100;
        rowsText.push(`🔒 **Ô #${i}** — Chưa mở khóa *(mở bằng \`!plant unlock\` tốn **${unlockCost}** điểm)*`);
        continue;
      }

      const plot = plotsMap.get(i);
      if (!plot || !plot.seed_item_code) {
        rowsText.push(`❌ **Ô #${i}** — Trống *(chưa trồng)*`);
        continue;
      }

      const itemDef = await getItemByCode(plot.seed_item_code);
      const cropName = itemDef?.name ?? plot.seed_item_code;
      const readyMs = plot.ready_at ? new Date(plot.ready_at).getTime() : now;

      if (now >= readyMs) {
        rowsText.push(`✅ **Ô #${i}** — **${cropName}** • 🌟 **Đã chín!** *(gõ \`!harvest ${i}\`)*`);
      } else {
        const remainSec = (readyMs - now) / 1000;
        rowsText.push(`✅ **Ô #${i}** — **${cropName}** • ⏳ Còn **${formatDuration(remainSec)}**`);
      }
    }

    const nextCost = unlockedPlots < MAX_PLOTS ? unlockedPlots * 100 : null;
    const footerHint = nextCost
      ? `Đã mở ${unlockedPlots}/${MAX_PLOTS} ô • Mở ô #${unlockedPlots + 1}: !plant unlock (${nextCost} điểm)`
      : `Đã mở tối đa ${MAX_PLOTS}/${MAX_PLOTS} ô ruộng`;

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle(`Linh Điền — ${message.member?.displayName ?? message.author.displayName}`)
      .setThumbnail(message.author.displayAvatarURL({ size: 256 }))
      .setDescription(rowsText.join("\n"))
      .addFields({
        name: "Hướng dẫn nhanh",
        value:
          "• Xem chi tiết 1 ô: `!plant info <stt>` (vd: `!plant info 1`)\n" +
          "• Gieo hạt: `!plant <stt> <hạt_giống>` (vd: `!plant 1-3,5 thanh thuy hat`)\n" +
          "• Thu hoạch: `!harvest` hoặc `!harvest 1-3`",
        inline: false,
      })
      .setFooter({ text: footerHint })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  // Trường hợp 2: Mở khóa thêm mảnh ruộng (!plant unlock)
  if (rawArgs.toLowerCase() === "unlock") {
    const { data, error } = await supabase.rpc("unlock_farm_plot", {
      p_discord_id: message.author.id,
      p_max_plots: MAX_PLOTS,
    });

    if (error) {
      console.error("Lỗi mở khóa ruộng:", error);
      await message.reply("Có lỗi khi mở khóa mảnh ruộng, thử lại sau nhé.");
      return;
    }

    const res = data as UnlockResult | null;
    if (!res?.ok) {
      if (res?.reason === "max_reached") {
        await message.reply(`Bạn đã mở khóa tối đa **${MAX_PLOTS}** mảnh ruộng rồi!`);
        return;
      }
      if (res?.reason === "not_enough_points") {
        await message.reply(
          `Không đủ điểm để mở **Ô #${res.next_plot}** (cần **${res.cost}** điểm, bạn hiện có **${res.current_points}** điểm).`
        );
        return;
      }
      await message.reply("Không thể mở khóa mảnh ruộng lúc này.");
      return;
    }

    await message.reply(
      `🌱 Chúc mừng! Bạn đã dùng **${res.cost}** điểm cầu nguyện để mở khóa **Ô ruộng #${res.unlocked}**!\nĐiểm còn lại: **${res.remaining_points}**.`
    );
    return;
  }

  // Trường hợp 3: Kiểm tra chi tiết 1 ô ruộng (!plant info <stt> hoặc !plant <stt>)
  const infoMatch = rawArgs.match(/^(?:info\s+)?(\d+)$/i);
  if (infoMatch) {
    const plotIndex = Number.parseInt(infoMatch[1], 10);
    if (plotIndex < 1 || plotIndex > MAX_PLOTS) {
      await message.reply(`Số thứ tự ô ruộng chỉ nằm trong khoảng từ **1** đến **${MAX_PLOTS}**.`);
      return;
    }

    const { unlockedPlots, plotsMap } = await getUserFarmState(message.author.id);
    if (plotIndex > unlockedPlots) {
      const unlockCost = (plotIndex - 1) * 100;
      await message.reply(
        `🔒 **Ô ruộng #${plotIndex}** hiện **chưa mở khóa** (cần mở lần lượt từng ô; giá mở ô này là **${unlockCost}** điểm).`
      );
      return;
    }

    const plot = plotsMap.get(plotIndex);
    if (!plot || !plot.seed_item_code) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle(`Chi Tiết Ô Ruộng #${plotIndex}`)
        .setDescription("❌ **Trạng thái:** Đất trống (chưa gieo hạt).")
        .addFields({
          name: "Gợi ý gieo trồng",
          value: `Gõ \`!plant ${plotIndex} <tên_hoặc_mã_hạt_giống>\` để bắt đầu trồng trên ô này.`,
        });
      await message.reply({ embeds: [emptyEmbed] });
      return;
    }

    const [seedDef, { data: recipe }] = await Promise.all([
      getItemByCode(plot.seed_item_code),
      supabase
        .from("discord_crop_recipes")
        .select("harvest_item_code, harvest_quantity, grow_seconds")
        .eq("seed_item_code", plot.seed_item_code)
        .maybeSingle(),
    ]);

    const harvestDef = recipe?.harvest_item_code
      ? await getItemByCode(recipe.harvest_item_code)
      : undefined;

    const now = Date.now();
    const plantedUnix = plot.planted_at ? Math.floor(new Date(plot.planted_at).getTime() / 1000) : null;
    const readyMs = plot.ready_at ? new Date(plot.ready_at).getTime() : now;
    const readyUnix = Math.floor(readyMs / 1000);
    const isReady = now >= readyMs;

    const detailEmbed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle(`Chi Tiết Ô Ruộng #${plotIndex}`)
      .setDescription(
        isReady
          ? "✅ **Trạng thái:** Đã chín — sẵn sàng thu hoạch!"
          : `✅ **Trạng thái:** Đang sinh trưởng *(còn **${formatDuration((readyMs - now) / 1000)}**)*`
      )
      .addFields(
        {
          name: "Hạt giống đã gieo",
          value: `**${seedDef?.name ?? plot.seed_item_code}**`,
          inline: true,
        },
        {
          name: "Nông sản thu hoạch",
          value: `**x${recipe?.harvest_quantity ?? 1} ${harvestDef?.name ?? recipe?.harvest_item_code ?? "Chưa rõ"}**`,
          inline: true,
        },
        {
          name: "Thời gian gieo & chín",
          value:
            `• Gieo lúc: ${plantedUnix ? `<t:${plantedUnix}:T>` : "Không rõ"}\n` +
            `• Chín lúc: <t:${readyUnix}:T> (<t:${readyUnix}:R>)`,
          inline: false,
        }
      );

    await message.reply({ embeds: [detailEmbed] });
    return;
  }

  // Trường hợp 4: Trồng hạt giống lên 1 hoặc nhiều ô (!plant 1-3,5 thanh thuy hat)
  const firstSpaceIdx = rawArgs.search(/\s+/);
  if (firstSpaceIdx === -1) {
    await message.reply(
      "Thiếu tên hoặc mã hạt giống! Ví dụ: `!plant 1 thanh thuy hat` hoặc `!plant 1-3,5 thanh thuy hat`"
    );
    return;
  }

  const plotSpec = rawArgs.slice(0, firstSpaceIdx).trim();
  const seedQuery = rawArgs.slice(firstSpaceIdx + 1).trim();

  const plotIndices = parsePlotIndices(plotSpec);
  if (!plotIndices || plotIndices.length === 0) {
    await message.reply(
      `Định dạng số thứ tự ô ruộng không hợp lệ (\`${plotSpec}\`). Hãy nhập dạng \`1\`, \`1-4\` hoặc \`1,3,5\`.`
    );
    return;
  }

  const seedDef = await findItemByCodeOrName(seedQuery);
  if (!seedDef) {
    await message.reply(`Không tìm thấy vật phẩm hạt giống \`${seedQuery}\` trong hệ thống.`);
    return;
  }

  const { data, error } = await supabase.rpc("plant_seeds_on_plots", {
    p_discord_id: message.author.id,
    p_plot_indices: plotIndices,
    p_seed_code: seedDef.code,
  });

  if (error) {
    console.error("Lỗi gọi RPC plant_seeds_on_plots:", error);
    await message.reply("Có lỗi khi gieo hạt giống, thử lại sau nhé.");
    return;
  }

  const res = data as PlantResult | null;
  if (!res?.ok) {
    if (res?.reason === "not_a_seed") {
      await message.reply(
        `**${seedDef.name}** không phải là hạt giống có thể gieo trồng (chưa có công thức trên hệ thống).`
      );
      return;
    }
    await message.reply("Không thể gieo trồng lúc này.");
    return;
  }

  const planted = res.planted ?? [];
  const skipped = res.skipped ?? [];

  if (planted.length === 0) {
    await message.reply(
      `Không gieo được ô nào!\nLý do: ${skipped.join(", ")}.`
    );
    return;
  }

  const lines = [
    `🌱 Đã gieo **x${planted.length} ${seedDef.name}** vào các ô: **${planted.map((n) => `#${n}`).join(", ")}**!`,
    `⏳ Thời gian sinh trưởng: **${formatDuration(res.grow_seconds ?? 120)}** | Hạt giống còn lại: **x${res.remaining_seeds ?? 0}**.`,
  ];

  if (skipped.length > 0) {
    lines.push(`⚠️ Các ô bỏ qua: ${skipped.join(", ")}.`);
  }

  await message.reply(lines.join("\n"));
}
  
