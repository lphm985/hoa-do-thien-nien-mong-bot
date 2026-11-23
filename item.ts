import { supabase } from "./supabase.js";

export type ItemDefinition = {
  code: string;
  name: string;
  rarity: "Thường" | "Hiếm" | "Sử Thi";
  weight: number; // Trọng số chọn ngẫu nhiên giữa các vật phẩm khi rớt đồ
  description: string;
};

// Tỉ lệ 1 lần cầu nguyện có rớt vật phẩm (0.35 = 35%)
export const PRAY_ITEM_DROP_CHANCE = 0.35;

// Danh sách vật phẩm có thể rớt khi cầu nguyện
export const ITEMS: ItemDefinition[] = [
  {
    code: "linh_huong",
    name: "Linh Hương Trầm",
    rarity: "Thường",
    weight: 60,
    description: "Nén hương thanh tịnh dùng để dâng tế Hoạ Đồ.",
  },
  {
    code: "ngoc_boi_van_khi",
    name: "Ngọc Bội Vận Khí",
    rarity: "Hiếm",
    weight: 28,
    description: "Mảnh ngọc mang linh khí, biểu trưng của người gặp may.",
  },
  {
    code: "hoa_do_tinh_phach",
    name: "Hoạ Đồ Tinh Phách",
    rarity: "Sử Thi",
    weight: 12,
    description: "Kết tinh hiếm có ngưng tụ từ cổ hoạ thiên niên.",
  },
];

export function getItemByCode(code: string): ItemDefinition | undefined {
  return ITEMS.find((item) => item.code === code);
}

export function rollPrayItemDrop(
  dropChance = PRAY_ITEM_DROP_CHANCE
): ItemDefinition | null {
  if (Math.random() >= dropChance) {
    return null;
  }

  const totalWeight = ITEMS.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;

  let pick = Math.random() * totalWeight;
  for (const item of ITEMS) {
    pick -= item.weight;
    if (pick <= 0) {
      return item;
    }
  }

  return ITEMS[ITEMS.length - 1] ?? null;
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
