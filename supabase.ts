import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

export const COOLDOWN_SECONDS = 60;

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}