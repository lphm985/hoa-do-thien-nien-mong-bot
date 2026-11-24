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
  baseBuyPrice: number;
  baseSellPrice: number;
  canBuy: boolean;
  canSell: boolean;
  changePercent: number;
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

function applyDelta(baseValue: number, changePercent: number): number {
  const safeBase = Math.max(0, Math.floor(baseValue));
  if (safeBase <= 0) return 0;
  return Math.max(1, Math.round(safeBase * (1 + changePercent / 100)));
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
      .select(
        "code, name, rarity, base_price, base_sell_price, shop_buy_enabled, shop_sell_enabled, is_active"
      )
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const config: ShopConfig = {
    cycleSeconds: Math.max(
      10,
      Number(cfgRow?.cycle_seconds ?? DEFAULT_CONFIG.cycleSeconds)
    ),
    randomItemCount: Math.max(
      0,
      Number(cfgRow?.random_item_count ?? DEFAULT_CONFIG.randomItemCount)
    ),
    maxChangePercent: Math.max(
      0,
      Math.min(
        95,
        Number(cfgRow?.max_change_percent ?? DEFAULT_CONFIG.maxChangePercent)
      )
    ),
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const cycleId = Math.floor(nowSec / config.cycleSeconds);
  const secondsUntilNextCycle = (cycleId + 1) * config.cycleSeconds - nowSec;

  const tradableItems = (itemsRows ?? [])
    .map((row) => {
      const baseBuyPrice = Math.max(0, Number(row.base_price ?? 0));
      const baseSellPrice = Math.max(0, Number(row.base_sell_price ?? 0));
      const canBuy = row.shop_buy_enabled !== false && baseBuyPrice > 0;
      const canSell = row.shop_sell_enabled !== false && baseSellPrice > 0;

      return {
        code: String(row.code),
        name: String(row.name),
        rarity: String(row.rarity ?? "Thường"),
        baseBuyPrice,
        baseSellPrice,
        canBuy,
        canSell,
      };
    })
    .filter((it) => it.canBuy || it.canSell);

  // Chọn ngẫu nhiên randomItemCount món ổn định trong suốt cycleId hiện tại
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
    let delta = seededRandomInt(`${cycleId}:delta:${code}`, -maxInt, maxInt);
    if (delta === 0) {
      delta = maxInt;
    }
    changeMap.set(code, delta);
  }

  const items: ShopItemPricing[] = tradableItems.map((it) => {
    const changePercent = changeMap.get(it.code) ?? 0;
    const buyPrice = it.canBuy
      ? applyDelta(it.baseBuyPrice, changePercent)
      : 0;
    const sellPrice = it.canSell
      ? applyDelta(it.baseSellPrice, changePercent)
      : 0;

    return {
      code: it.code,
      name: it.name,
      rarity: it.rarity,
      baseBuyPrice: it.baseBuyPrice,
      baseSellPrice: it.baseSellPrice,
      canBuy: it.canBuy,
      canSell: it.canSell,
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
