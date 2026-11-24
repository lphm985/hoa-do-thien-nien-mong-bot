import crypto from "node:crypto";
import { supabase } from "./supabase.js";

export type ShopConfig = {
  cycleSeconds: number;
  randomItemCount: number;
  maxChangePercent: number;
};

export type ShopItemPricing = {
  code: string;
  name: string;
  rarity: string;
  basePrice: number;
  changePercent: number; // 0 nếu không nằm trong danh sách biến động chu kỳ này
  buyPrice: number;
  sellPrice: number;
};

export type ShopSnapshot = {
  config: ShopConfig;
  cycleId: number;
  secondsUntilNextCycle: number;
  items: ShopItemPricing[];
};

const DEFAULT_CONFIG: ShopConfig = {
  cycleSeconds: 3600,
  randomItemCount: 3,
  maxChangePercent: 30,
};

function seededRandomInt(seedStr: string, min: number, max: number): number {
  const digest = crypto.createHash("sha256").update(seedStr).digest();
  const num = digest.readUInt32BE(0);
  if (max <= min) return min;
  return min + (num % (max - min + 1));
}

export function computePricesForItem(
  basePrice: number,
  changePercent: number
): { buyPrice: number; sellPrice: number } {
  const safeBase = Math.max(0, Math.floor(basePrice));
  if (safeBase <= 0) {
    return { buyPrice: 0, sellPrice: 0 };
  }
  const adjustedBuy = Math.max(
    1,
    Math.round(safeBase * (1 + changePercent / 100))
  );
  // Giá bán cố định = 80% giá mua
  const sellPrice = Math.max(1, Math.floor(adjustedBuy * 0.8));
  return { buyPrice: adjustedBuy, sellPrice };
}

export async function getShopSnapshot(): Promise<ShopSnapshot> {
    const [{ data: cfgRow }, { data: itemsRows }] = await Promise.all([
    supabase
      .from("discord_shop_config")
      .select("cycle_seconds, random_item_count, max_change_percent")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("discord_items")
      .select("code, name, rarity, base_price, is_active, shop_enabled")
      .eq("is_active", true)
      .eq("shop_enabled", true)
      .gt("base_price", 0)
      .order("name", { ascending: true }),
  ]);


  const config: ShopConfig = {
    cycleSeconds: Math.max(10, Number(cfgRow?.cycle_seconds ?? DEFAULT_CONFIG.cycleSeconds)),
    randomItemCount: Math.max(
      0,
      Number(cfgRow?.random_item_count ?? DEFAULT_CONFIG.randomItemCount)
    ),
    maxChangePercent: Math.max(
      0,
      Math.min(95, Number(cfgRow?.max_change_percent ?? DEFAULT_CONFIG.maxChangePercent))
    ),
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const cycleId = Math.floor(nowSec / config.cycleSeconds);
  const secondsUntilNextCycle =
    (cycleId + 1) * config.cycleSeconds - nowSec;

  const tradableItems = (itemsRows ?? []).map((row) => ({
    code: String(row.code),
    name: String(row.name),
    rarity: String(row.rarity ?? "Thường"),
    basePrice: Math.max(0, Number(row.base_price ?? 0)),
  }));

  // Xáo trộn ổn định theo cycleId để chọn ngẫu nhiên randomItemCount món cho chu kỳ này
  const shuffled = [...tradableItems].sort((a, b) => {
    const ka = crypto
      .createHash("sha256")
      .update(`${cycleId}:${a.code}`)
      .digest("hex");
    const kb = crypto
      .createHash("sha256")
      .update(`${cycleId}:${b.code}`)
      .digest("hex");
    return ka.localeCompare(kb);
  });

  const pickedCodes = new Set(
    shuffled.slice(0, config.randomItemCount).map((i) => i.code)
  );

  const maxInt = Math.max(1, Math.round(config.maxChangePercent));
  const changeMap = new Map<string, number>();

  for (const code of pickedCodes) {
    // Sinh % tăng/giảm khác 0 trong [-maxInt, +maxInt]
    let delta = seededRandomInt(`${cycleId}:delta:${code}`, -maxInt, maxInt);
    if (delta === 0) {
      delta = maxInt;
    }
    changeMap.set(code, delta);
  }

  const items: ShopItemPricing[] = tradableItems.map((it) => {
    const changePercent = changeMap.get(it.code) ?? 0;
    const { buyPrice, sellPrice } = computePricesForItem(
      it.basePrice,
      changePercent
    );
    return {
      code: it.code,
      name: it.name,
      rarity: it.rarity,
      basePrice: it.basePrice,
      changePercent,
      buyPrice,
      sellPrice,
    };
  });

  return {
    config,
    cycleId,
    secondsUntilNextCycle,
    items,
  };
      }
