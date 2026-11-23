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
    code: "linh_huong",
    name: "Linh Hương Trầm",
    rarity: "Thường",
    dropRate: 0.25, // 25%
    description: "Nén hương thanh tịnh dùng để dâng tế Hoạ Đồ.",
  },
  {
    code: "ngoc_boi_van_khi",
    name: "Ngọc Bội Vận Khí",
    rarity: "Hiếm",
    dropRate: 0.1, // 10%
    description: "Mảnh ngọc mang linh khí, biểu trưng của người gặp may.",
  },
  {
    code: "hoa_do_tinh_phach",
    name: "Hoạ Đồ Tinh Phách",
    rarity: "Sử Thi",
    dropRate: 0.03, // 3%
    description: "Kết tinh hiếm có ngưng tụ từ cổ hoạ thiên niên.",
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
