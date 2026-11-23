import { supabase } from "./supabase.js";

export type ItemDefinition = {
  code: string;
  name: string;
  rarity: string;
  dropRate: number;
  description: string;
};

type DiscordItemRow = {
  code: string;
  name: string;
  rarity: string;
  drop_rate: number;
  description: string;
  is_active: boolean;
};

const CACHE_TTL_MS = 30_000; // Làm mới danh sách vật phẩm sau mỗi 30 giây
let cachedItems: ItemDefinition[] = [];
let lastFetchedAt = 0;

export async function getActiveItems(forceRefresh = false): Promise<ItemDefinition[]> {
  const now = Date.now();
  if (!forceRefresh && cachedItems.length > 0 && now - lastFetchedAt < CACHE_TTL_MS) {
    return cachedItems;
  }

  const { data, error } = await supabase
    .from("discord_items")
    .select("code, name, rarity, drop_rate, description, is_active")
    .eq("is_active", true);

  if (error) {
    console.error("Lỗi tải danh sách vật phẩm từ Supabase:", error);
    return cachedItems;
  }

  const rows = (data ?? []) as DiscordItemRow[];
  cachedItems = rows.map((row) => ({
    code: row.code,
    name: row.name,
    rarity: row.rarity,
    dropRate: Number(row.drop_rate ?? 0),
    description: row.description ?? "",
  }));
  lastFetchedAt = now;

  return cachedItems;
}

export async function getItemByCode(code: string): Promise<ItemDefinition | undefined> {
  const items = await getActiveItems();
  return items.find((item) => item.code === code);
}

function normalizeText(str: string): string {
  return str
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function removeAccents(str: string): string {
  return normalizeText(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export async function findItemByCodeOrName(
  query: string
): Promise<ItemDefinition | undefined> {
  const cleaned = normalizeText(query);
  if (!cleaned) return undefined;

  const noAccentQuery = removeAccents(query);
  const items = await getActiveItems();

  return (
    // 1. Khớp chính xác mã (code)
    items.find((item) => normalizeText(item.code) === cleaned) ??
    // 2. Khớp chính xác tên (đã cắt khoảng trắng thừa 2 đầu)
    items.find((item) => normalizeText(item.name) === cleaned) ??
    // 3. Khớp tên không dấu (phòng trường hợp gõ thiếu/sai kiểu dấu trên điện thoại)
    items.find((item) => removeAccents(item.name) === noAccentQuery)
  );
}

export async function rollPrayItemDrop(): Promise<ItemDefinition | null> {
  const items = await getActiveItems();
  if (items.length === 0) return null;

  const roll = Math.random();
  let cumulative = 0;

  for (const item of items) {
    if (item.dropRate <= 0) continue;
    cumulative += item.dropRate;
    if (roll < cumulative) {
      return item;
    }
  }

  return null;
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
