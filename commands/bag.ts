import { EmbedBuilder, type Message } from "discord.js";
import type { CommandMeta } from "../commandLoader.js";
import { findItemByCodeOrName, getItemByCode } from "../items.js";
import { supabase } from "../supabase.js";

export const commandInfo: CommandMeta = {
  name: "bag",
  aliases: ["inv"],
  command: "!bag [@user | info <tên_hoặc_mã> [@user]]",
  description:
    "Xem bảng kho đồ gọn (tên, độ hiếm, số lượng) hoặc xem chi tiết vật phẩm qua !bag info <tên>.",
};

type UserItemRow = {
  item_code: string;
  quantity: number;
};

type CropRecipeInfo = {
  seed_item_code: string;
  harvest_item_code: string;
  harvest_quantity: number;
  grow_seconds: number;
};

export async function execute(message: Message): Promise<void> {
  const rawArgs = message.content
    .trim()
    .replace(/^!(bag|inv)\b/i, "")
    .trim();

  // Nhánh 1: Xem chi tiết vật phẩm (!bag info <tên_hoặc_mã> [@user])
  const infoMatch = rawArgs.match(/^info(?:\s+(.+))?$/i);
  if (infoMatch) {
    const mentionedUser = message.mentions.users.first();
    const ownerUser = mentionedUser ?? message.author;
    const ownerMember = message.guild?.members.cache.get(ownerUser.id);
    const ownerName = ownerMember?.displayName ?? ownerUser.displayName;

    const itemQuery = (infoMatch[1] ?? "")
      .replace(/<@!?\d+>/g, "")
      .trim();

    if (!itemQuery) {
      await message.reply(
        "Bạn chưa nhập tên hoặc mã vật phẩm! Ví dụ: `!bag info Thanh Thủy hạt` hoặc `!bag info linh_huong`."
      );
      return;
    }

    const itemDef = await findItemByCodeOrName(itemQuery);
    if (!itemDef) {
      await message.reply(
        `Không tìm thấy vật phẩm nào khớp với \`${itemQuery}\`.`
      );
      return;
    }

    const [{ data: ownedRow }, { data: asSeedRecipe }, { data: asHarvestRecipe }] =
      await Promise.all([
        supabase
          .from("discord_user_items")
          .select("quantity")
          .eq("discord_id", ownerUser.id)
          .eq("item_code", itemDef.code)
          .maybeSingle(),
        supabase
          .from("discord_crop_recipes")
          .select("seed_item_code, harvest_item_code, harvest_quantity, grow_seconds")
          .eq("seed_item_code", itemDef.code)
          .maybeSingle(),
        supabase
          .from("discord_crop_recipes")
          .select("seed_item_code, harvest_item_code, harvest_quantity, grow_seconds")
          .eq("harvest_item_code", itemDef.code)
          .maybeSingle(),
      ]);

    const quantity = ownedRow?.quantity ?? 0;
    const dropPct = (itemDef.dropRate * 100)
      .toFixed(2)
      .replace(/\.00$/, "");

    const detailEmbed = new EmbedBuilder()
      .setColor(0x38bdf8)
      .setTitle(`Chi Tiết Vật Phẩm — ${itemDef.name}`)
      .setThumbnail(ownerUser.displayAvatarURL({ size: 256 }))
      .setDescription(
        itemDef.description
          ? `*${itemDef.description}*`
          : "*Vật phẩm chưa có mô tả chi tiết.*"
      )
      .addFields(
        {
          name: "Độ hiếm",
          value: `**${itemDef.rarity}**`,
          inline: true,
        },
        {
          name: `Số lượng của ${ownerName}`,
          value: `**x${quantity}**`,
          inline: true,
        },
        {
          name: "Tỉ lệ rơi (!pray)",
          value: `**${dropPct}%**`,
          inline: true,
        },
        {
          name: "Mã định danh (code)",
          value: `\`${itemDef.code}\``,
          inline: true,
        }
      )
      .setFooter({
        text: "Hoạ Đồ Thiên Niên Mộng",
        iconURL: message.client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    const seedRecipe = asSeedRecipe as CropRecipeInfo | null;
    const harvestRecipe = asHarvestRecipe as CropRecipeInfo | null;

    if (seedRecipe) {
      const harvestDef = await getItemByCode(seedRecipe.harvest_item_code);
      detailEmbed.addFields({
        name: "Công thức gieo trồng",
        value: `Gieo hạt này mất **${seedRecipe.grow_seconds}s** → thu hoạch **x${seedRecipe.harvest_quantity} ${harvestDef?.name ?? seedRecipe.harvest_item_code}**.`,
        inline: false,
      });
    } else if (harvestRecipe) {
      const seedDef = await getItemByCode(harvestRecipe.seed_item_code);
      detailEmbed.addFields({
        name: "Nguồn gốc nông sản",
        value: `Thu hoạch từ hạt giống **${seedDef?.name ?? harvestRecipe.seed_item_code}** (**x${harvestRecipe.harvest_quantity}**/ô, mất **${harvestRecipe.grow_seconds}s** lớn).`,
        inline: false,
      });
    }

    await message.reply({ embeds: [detailEmbed] });
    return;
  }

  // Nhánh 2: Xem bảng kho đồ gọn (!bag [@user])
  const targetUser = message.mentions.users.first() ?? message.author;
  const member = message.guild?.members.cache.get(targetUser.id);
  const displayName = member?.displayName ?? targetUser.displayName;

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

  const embed = new EmbedBuilder()
    .setColor(0x38bdf8)
    .setTitle(`Kho Đồ — ${displayName}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setFooter({
      text: "Xem chi tiết món: !bag info <tên vật phẩm>",
      iconURL: message.client.user?.displayAvatarURL(),
    })
    .setTimestamp();

  if (rows.length === 0) {
    embed.setDescription(
      "Kho đồ hiện đang trống. Hãy thử `!pray` để cầu cơ duyên nhận vật phẩm!"
    );
  } else {
    const lines = await Promise.all(
      rows.map(async (row) => {
        const def = await getItemByCode(row.item_code);
        const name = def ? def.name : row.item_code;
        const rarity = def ? def.rarity : "Không rõ";
        return `• **${name}** *(${rarity})* — **x${row.quantity}**`;
      })
    );

    embed.setDescription(lines.join("\n"));
  }

  await message.reply({ embeds: [embed] });
}
