import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_FEE_BP } from "@/lib/domain/money";

// Platform configuration — spec 5.3 and 5.6. These are rows, not constants, so a
// Maintain admin changes the fee or a booking minimum without a deployment, and
// existing engagements are unaffected because they hold snapshots (13.1).

export const CONFIG_KEYS = {
  FEE_BP: "fee_bp",
  MINIMUM_HOURS_PER_LINE: "minimum_hours_per_line",
  MINIMUM_CREW_SIZE: "minimum_crew_size",
} as const;

export const CONFIG_DEFAULTS = {
  [CONFIG_KEYS.FEE_BP]: DEFAULT_FEE_BP,       // 15% placeholder, Open Question 1
  [CONFIG_KEYS.MINIMUM_HOURS_PER_LINE]: 8,    // Open Question 5
  [CONFIG_KEYS.MINIMUM_CREW_SIZE]: 1,         // founders may raise to 2
} as const;

export async function getConfig(key: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_config")
    .select("value_int")
    .eq("key", key)
    .maybeSingle();

  const fallback = CONFIG_DEFAULTS[key as keyof typeof CONFIG_DEFAULTS];
  return data?.value_int ?? fallback ?? 0;
}

export async function getBookingRules(): Promise<{
  feeBp: number;
  minimumHoursPerLine: number;
  minimumCrewSize: number;
}> {
  const [feeBp, minimumHoursPerLine, minimumCrewSize] = await Promise.all([
    getConfig(CONFIG_KEYS.FEE_BP),
    getConfig(CONFIG_KEYS.MINIMUM_HOURS_PER_LINE),
    getConfig(CONFIG_KEYS.MINIMUM_CREW_SIZE),
  ]);
  return { feeBp, minimumHoursPerLine, minimumCrewSize };
}
