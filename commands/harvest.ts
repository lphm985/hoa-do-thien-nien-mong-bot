import type { Message } from "discord.js";
import type { CommandMeta } from "../commandLoader.js";
import { getItemByCode } from "../items.js";
import { supabase } from "../supabase.js";

export const commandInfo: CommandMeta = {
  name: "harvest",
  command: "!harvest [stt]",
  description: "Thu hoạch nông sản trên các ô ruộng đã chín (vd: !harvest hoặc !harvest 1-3,5).",
};

type HarvestResult = {
  ok?: boolean;
  harvested_plots?: number[];
  rewards?: Record<string, number>;
};

function parsePlotIndices(spec: string): number[] | null {
  const cleaned = spec.replace(/\s+/g, "");
  if (!/^[0-9,-]+$/.test(cleaned)) return null;

  const result = new Set<number>();
  for (const seg of cleaned.split(",").filter(Boolean)) {
    if (seg.includes("-")) {
      const [a, b] = seg.split("-");
      const start = Number.parseInt(a, 10);
      const end = Number.parseInt(b, 10);
      if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end < start || end > 50) {
        return null;
      }
      for (let i = start; i <= end; i++) result.add(i);
    } else {
      const num = Number.parseInt(seg, 10);
      if (Number.isNaN(num) || num < 1 || num > 50) return null;
      result.add(num);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

export async function execute(message: Message): Promise<void> {
  const rawArgs = message.content.trim().replace(/^!harvest\b/i, "").trim();

  let plotIndices: number[] | null = null;
  if (rawArgs) {
    plotIndices = parsePlotIndices(rawArgs);
    if (!plotIndices) {
      await message.reply(
        `Định dạng số thứ tự ô ruộng không hợp lệ (\`${rawArgs}\`). Hãy dùng dạng \`1\`, \`1-4\` hoặc \`1,3,5\`.`
      );
      return;
    }
  }

  const { data, error } = await supabase.rpc("harvest_farm_plots", {
    p_discord_id: message.author.id,
    p_plot_indices: plotIndices,
  });

  if (error) {
    console.error("Lỗi gọi RPC harvest_farm_plots:", error);
    await message.reply("Có lỗi khi thu hoạch nông sản, thử lại sau nhé.");
    return;
  }

  const res = data as HarvestResult | null;
  const harvestedPlots = res?.harvested_plots ?? [];
  const rewards = res?.rewards ?? {};

  if (harvestedPlots.length === 0) {
    await message.reply(
      "Hiện chưa có ô ruộng nào chín để thu hoạch! Gõ `!plant` để xem thời gian còn lại nhé."
    );
    return;
  }

  const rewardLines: string[] = [];
  for (const [itemCode, qty] of Object.entries(rewards)) {
    const itemDef = await getItemByCode(itemCode);
    rewardLines.push(`• **x${qty} ${itemDef?.name ?? itemCode}**`);
  }

  await message.reply(
    `🌾 Thu hoạch thành công các ô: **${harvestedPlots.map((n) => `#${n}`).join(", ")}**!\n` +
      `Nông sản nhận được vào kho:\n${rewardLines.join("\n")}`
  );
}
