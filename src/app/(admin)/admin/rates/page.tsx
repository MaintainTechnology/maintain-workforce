import type { Metadata } from "next";
import { Notice, PageHeader, TableFrame } from "@/components/admin-page";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { CONFIG_KEYS, getBookingRules } from "@/lib/config";
import { formatCentsExGst } from "@/lib/domain/money";
import { LABEL, PANEL, BTN_PRIMARY, BTN_GHOST_SM } from "@/lib/ui";
import { INPUT, MONO, SECTION_TITLE, TABLE, TH, TD, formatDate } from "@/lib/admin-ui";

// Recommended rate bands and the commercial configuration — spec module 5.
//
// 5.1: Maintain publishes a recommended band per (trade, proficiency, region) and the
// history is retained — a new effective-dated row, never a destructive edit, so a band
// change can never rewrite what a past match was proposed against.
// 5.2: the band is a recommendation. The supplier owns its rate and confirms or
// overrides the pre-fill; nothing on this screen sets a supplier's price.
// 5.3 / 5.6: the platform fee and the booking minimums are configuration rows, editable
// here without a deployment, and existing matches and engagements hold snapshots (13.1),
// so an edit changes new proposals only.
//
// Amber budget (DESIGN.md): one — the band publish, the action with commercial reach.

export const metadata: Metadata = { title: "Rates and fees" };

const BASE_PATH = "/admin/rates";

const SMALL_BTN = BTN_GHOST_SM;

function finish(params: { ok?: string; error?: string }): never {
  const search = new URLSearchParams();
  if (params.ok) search.set("ok", params.ok);
  if (params.error) search.set("error", params.error);
  revalidatePath(BASE_PATH);
  const query = search.toString();
  redirect(query ? `${BASE_PATH}?${query}` : BASE_PATH);
}

/** Dollars in the form, integer cents in the database (20.1). */
const dollarsToCents = z.coerce
  .number()
  .positive("Enter an amount above zero.")
  .transform((dollars) => Math.round(dollars * 100));

const bandSchema = z
  .object({
    trade_role_id: z.string().uuid(),
    proficiency_id: z.string().uuid(),
    region_id: z.string().uuid(),
    band_low_cents: dollarsToCents,
    band_high_cents: dollarsToCents,
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an effective date."),
  })
  .refine((b) => b.band_high_cents >= b.band_low_cents, {
    message: "The top of the band cannot be below the bottom.",
  });

async function publishRateBand(formData: FormData): Promise<void> {
  "use server";
  const actor = await requireMaintainAdmin();
  const parsed = bandSchema.safeParse({
    trade_role_id: formData.get("trade_role_id"),
    proficiency_id: formData.get("proficiency_id"),
    region_id: formData.get("region_id"),
    band_low_cents: formData.get("band_low"),
    band_high_cents: formData.get("band_high"),
    effective_from: formData.get("effective_from"),
  });
  if (!parsed.success) finish({ error: parsed.error.issues[0].message });

  const db = createAdminClient();

  // 4.2 — rate bands may only use a (trade, proficiency) combination present in the
  // TradeRoleProficiency join. Enforced server-side: the select is a convenience.
  const { data: allowed } = await db
    .from("trade_role_proficiency")
    .select("trade_role_id")
    .eq("trade_role_id", parsed.data.trade_role_id)
    .eq("proficiency_id", parsed.data.proficiency_id)
    .maybeSingle();
  if (!allowed) {
    finish({ error: "That trade does not support this proficiency level — map it in the catalogue first." });
  }

  const { data, error } = await db.from("rate_band").insert(parsed.data).select("id").single();
  if (error) {
    // The unique key is (trade, proficiency, region, effective_from): a same-day
    // republish is a correction, and 5.1 forbids destroying history to make one.
    finish({
      error: error.message.includes("duplicate")
        ? "A band for that trade, level and region already starts on that date. Use a later effective date."
        : error.message,
    });
  }

  await audit({
    actor: { userId: actor.id },
    action: "rate_band.published",
    entityType: "rate_band",
    entityId: data.id,
    after: parsed.data,
  });
  finish({ ok: "Band published. Existing matches and engagements keep their snapshot." });
}

const configSchema = z.object({
  fee_bp: z.coerce.number().int().min(0).max(10000),
  minimum_hours_per_line: z.coerce.number().int().min(1).max(168),
  minimum_crew_size: z.coerce.number().int().min(1).max(50),
});

async function updateCommercialConfig(formData: FormData): Promise<void> {
  "use server";
  const actor = await requireMaintainAdmin();
  const parsed = configSchema.safeParse({
    fee_bp: formData.get("fee_bp"),
    minimum_hours_per_line: formData.get("minimum_hours_per_line"),
    minimum_crew_size: formData.get("minimum_crew_size"),
  });
  if (!parsed.success) finish({ error: parsed.error.issues[0].message });

  const db = createAdminClient();
  const before = await getBookingRules();

  const rows = [
    { key: CONFIG_KEYS.FEE_BP, value_int: parsed.data.fee_bp },
    { key: CONFIG_KEYS.MINIMUM_HOURS_PER_LINE, value_int: parsed.data.minimum_hours_per_line },
    { key: CONFIG_KEYS.MINIMUM_CREW_SIZE, value_int: parsed.data.minimum_crew_size },
  ].map((row) => ({ ...row, updated_at: new Date().toISOString(), updated_by: actor.id }));

  const { error } = await db.from("platform_config").upsert(rows, { onConflict: "key" });
  if (error) finish({ error: error.message });

  // 18.2 — fee config changes are a named audited event; they move real money.
  await audit({
    actor: { userId: actor.id },
    action: "platform_config.commercial_updated",
    entityType: "platform_config",
    before,
    after: parsed.data,
  });
  finish({ ok: "Configuration saved. Existing matches and engagements are unaffected." });
}

export default async function RatesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireMaintainAdmin();
  const params = await searchParams;
  const db = createAdminClient();

  const [bands, trades, proficiencies, regions, rules] = await Promise.all([
    db
      .from("rate_band")
      // One literal string: the client infers the row shape from the select text.
      .select("id, band_low_cents, band_high_cents, effective_from, created_at, trade_role:trade_role_id (name), proficiency:proficiency_id (name, rank), region:region_id (name)")
      .order("effective_from", { ascending: false }),
    db.from("trade_role").select("id, name, is_active").eq("is_active", true).order("name"),
    db.from("proficiency").select("id, name, rank, is_active").eq("is_active", true).order("rank"),
    db.from("region").select("id, name, is_active").eq("is_active", true).order("name"),
    getBookingRules(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  type Named = { name: string } | { name: string }[] | null;
  type BandRow = {
    id: string;
    band_low_cents: number;
    band_high_cents: number;
    effective_from: string;
    trade_role: Named;
    proficiency: Named;
    region: Named;
  };
  const bandRows: BandRow[] = (bands.data ?? []) as unknown as BandRow[];
  // PostgREST returns an embedded to-one relation as an object; without generated types
  // the client's inference cannot prove that, so both shapes are read the same way.
  const named = (value: Named): string => {
    const row = Array.isArray(value) ? value[0] : value;
    return row?.name ?? "—";
  };

  return (
    <div className="flex flex-col gap-(--space-6)">
      <PageHeader
        title="Rates and fees"
        lead="Manage recommended rate bands by trade, level and region. Each supplying business sets its own rate. All amounts are ex GST."
      />

      {(params.ok || params.error) && (
        <Notice tone={params.error ? "error" : "ok"}>{params.error ?? params.ok}</Notice>
      )}

      {/* 5.3 / 5.6 configuration ---------------------------------------------------- */}
      <section className={`${PANEL} min-w-0 p-(--space-6)`}>
        <h2 className={SECTION_TITLE}>Commercial configuration</h2>
        <p className="mt-(--space-3) max-w-[70ch] text-body text-on-dark-muted">
          The platform fee and the booking minimums are configuration, not constants. A
          change here applies to new proposals only: every match snapshots the fee at
          proposal and every engagement copies that snapshot, so past deals never move.
        </p>
        <form
          action={updateCommercialConfig}
          className="mt-(--space-5) grid gap-(--space-5) md:grid-cols-4 md:items-end"
        >
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="fee_bp" className="text-sm font-semibold text-on-dark">
              Platform fee (basis points)
            </label>
            <input
              id="fee_bp"
              name="fee_bp"
              type="number"
              min={0}
              max={10000}
              required
              defaultValue={rules.feeBp}
              className={`${INPUT} ${MONO}`}
            />
            <p className="text-sm text-on-dark-muted">
              {(rules.feeBp / 100).toFixed(2)}% on the supplier rate
            </p>
          </div>
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="minimum_hours_per_line" className="text-sm font-semibold text-on-dark">
              Minimum hours per line
            </label>
            <input
              id="minimum_hours_per_line"
              name="minimum_hours_per_line"
              type="number"
              min={1}
              max={168}
              required
              defaultValue={rules.minimumHoursPerLine}
              className={`${INPUT} ${MONO}`}
            />
          </div>
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="minimum_crew_size" className="text-sm font-semibold text-on-dark">
              Minimum crew size per match
            </label>
            <input
              id="minimum_crew_size"
              name="minimum_crew_size"
              type="number"
              min={1}
              max={50}
              required
              defaultValue={rules.minimumCrewSize}
              className={`${INPUT} ${MONO}`}
            />
          </div>
          <button type="submit" className={SMALL_BTN}>
            Save configuration
          </button>
        </form>
      </section>

      {/* 5.1 band publication ------------------------------------------------------- */}
      <section className={`${PANEL} min-w-0 p-(--space-6)`}>
        <h2 className={SECTION_TITLE}>Publish a recommended band</h2>
        <p className="mt-(--space-3) max-w-[70ch] text-body text-on-dark-muted">
          A band is effective-dated. Publishing a new one for the same trade, level and
          region supersedes the previous band from its effective date; the earlier row
          stays as history.
        </p>
        <form
          action={publishRateBand}
          className="mt-(--space-5) grid gap-(--space-4) md:grid-cols-3 lg:grid-cols-6 lg:items-end"
        >
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="trade_role_id" className="text-sm font-semibold text-on-dark">
              Trade
            </label>
            <select id="trade_role_id" name="trade_role_id" required className={INPUT}>
              <option value="">Choose</option>
              {(trades.data ?? []).map((t: { id: string; name: string }) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="proficiency_id" className="text-sm font-semibold text-on-dark">
              Level
            </label>
            <select id="proficiency_id" name="proficiency_id" required className={INPUT}>
              <option value="">Choose</option>
              {(proficiencies.data ?? []).map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="region_id" className="text-sm font-semibold text-on-dark">
              Region
            </label>
            <select id="region_id" name="region_id" required className={INPUT}>
              <option value="">Choose</option>
              {(regions.data ?? []).map((r: { id: string; name: string }) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="band_low" className="text-sm font-semibold text-on-dark">
              Band low (AUD/hr ex GST)
            </label>
            <input
              id="band_low"
              name="band_low"
              type="number"
              step="0.01"
              min="0.01"
              required
              className={`${INPUT} ${MONO}`}
            />
          </div>
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="band_high" className="text-sm font-semibold text-on-dark">
              Band high (AUD/hr ex GST)
            </label>
            <input
              id="band_high"
              name="band_high"
              type="number"
              step="0.01"
              min="0.01"
              required
              className={`${INPUT} ${MONO}`}
            />
          </div>
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="effective_from" className="text-sm font-semibold text-on-dark">
              Effective from
            </label>
            <input
              id="effective_from"
              name="effective_from"
              type="date"
              required
              defaultValue={today}
              className={`${INPUT} ${MONO}`}
            />
          </div>
          <button type="submit" className={`${BTN_PRIMARY} lg:col-span-2`}>
            Publish band
          </button>
        </form>
      </section>

      {/* 5.1 history ---------------------------------------------------------------- */}
      <section className={`${PANEL} min-w-0 p-(--space-6)`}>
        <h2 className={SECTION_TITLE}>Published bands</h2>
        <p className={`${LABEL} mt-(--space-2)`}>Newest first — history is never edited away</p>
        {bandRows.length === 0 ? (
          <p className="mt-(--space-5) text-body text-on-dark-muted">
            No bands yet. Rate bands load from the founders&rsquo; spreadsheet through the
            seed script; a line with no applicable band is flagged &ldquo;no recommended
            band&rdquo; and the supplying business still sets its own rate.
          </p>
        ) : (
          <TableFrame inset className="mt-(--space-5)">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Trade</th>
                  <th className={TH}>Level</th>
                  <th className={TH}>Region</th>
                  <th className={TH}>Band low</th>
                  <th className={TH}>Band high</th>
                  <th className={TH}>Effective from</th>
                </tr>
              </thead>
              <tbody>
                {bandRows.map((band) => (
                  <tr key={band.id}>
                    <td className={TD}>{named(band.trade_role)}</td>
                    <td className={TD}>{named(band.proficiency)}</td>
                    <td className={TD}>{named(band.region)}</td>
                    <td className={`${TD} ${MONO}`}>{formatCentsExGst(band.band_low_cents)}</td>
                    <td className={`${TD} ${MONO}`}>{formatCentsExGst(band.band_high_cents)}</td>
                    <td className={`${TD} ${MONO}`}>{formatDate(band.effective_from)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </section>
    </div>
  );
}
