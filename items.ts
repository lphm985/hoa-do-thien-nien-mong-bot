import { supabase } from "./supabase.js";

export type ItemDefinition = {
  code: string;
  name: string;
  rarity: "Thường" | "Hiếm" | "Sử Thi";
  dropRate: number; // Tỉ lệ rơi trực tiếp mỗi lần !pray (VD: 0.25 = 25%, 0.03 = 3%)
  description: string;
};

// Danh sách vật phẩm & tỉ lệ rơi riêng từng món (tổng dropRate <= 1)
export const ITEMS: ItemDefinition[] = [
  {
    code: "seed1",
    name: "Xích Diệm hạt",
    rarity: "Thường",
    dropRate: 0.2, // 20%
    description: "Hạt giống mang tính hoả, có lẽ sẽ có công dụng nào đó...",
  },
  {
    code: "seed10",
    name: "Thanh Ngọc hạt",
    rarity: "Hiếm",
    dropRate: 0.1, // 10%
    description: "Hạt giống mang linh khí, biểu trưng của sự hài hòa.",
  },
  {
    code: "seed2",
    name: "Thạch Điệp hạt",
    rarity: "Thường",
    dropRate: 0.2, // 20%
    description: "Kết tinh của đất, có lẽ sẽ có công dụng nào đó...",
  },
];

export function getItemByCode(code: string): ItemDefinition | undefined {
  return ITEMS.find((item) => item.code === code);
}

export function rollPrayItemDrop(): ItemDefinition | null {
  const roll = Math.random(); // Số ngẫu nhiên từ 0 đến < 1
  let cumulative = 0;

  for (const item of ITEMS) {
    cumulative += item.dropRate;
    if (roll < cumulative) {
      return item;
    }
  }

  return null; // Rơi vào khoảng còn lại (không rớt vật phẩm)
}

export async function grantItemToUser(
  discordId: string,
  itemCode: string,
  quantity = 1
): Promise<{ ok: boolean; newQuantity?: number }> {
  const { data, error } = await supabase.rpc("add_user_item", {
    p_discord_id: discordId,
    p_item_code: itemCode,
    p_quantity: quantity,
  });

  if (error) {
    console.error("Lỗi gọi Supabase RPC add_user_item:", error);
    return { ok: false };
  }

  return { ok: true, newQuantity: Number(data ?? quantity) };
}
