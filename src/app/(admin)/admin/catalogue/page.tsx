import type { Metadata } from "next";
import { requireMaintainAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { H1, H2, LABEL, PANEL, BTN_PRIMARY } from "@/lib/ui";
import { MONO, TABLE, TH, TD, pill } from "@/lib/platform-ui";
import {
  createIndustry,
  createProficiency,
  createQualification,
  createRegion,
  createSkill,
  createTradeRole,
  renameCatalogueItem,
  setCatalogueItemActive,
  setTradeProficiency,
  setTradeQualification,
} from "@/lib/actions/catalogue";

// Catalogue administration — spec module 4. Adding or editing reference data requires
// no deployment (4.1), so this screen is the whole maintenance story: Industry →
// TradeRole → Skill, plus Qualification, Proficiency and Region, the 4.2 proficiency
// join and the 4.5 qualification mapping.
//
// Plain forms posting to server actions: no client component, no optimistic state. An
// admin on a desk at 1280px gets a full page render per change, which is the right
// trade for a screen edited a handful of times a week.
//
// Amber budget (DESIGN.md): one — the "Add" primary in the trade mapping panel, the
// only action on this page that changes what the matching workspace can propose.

export const metadata: Metadata = { title: "Catalogue" };

type Item = { id: string; name: string; is_active: boolean };
type Trade = Item & { industry_id: string };
type Prof = Item & { rank: number };

const INPUT =
  "min-h-11 w-full rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-3) py-(--space-2) text-body text-on-dark placeholder:text-on-dark-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const SMALL_BTN =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-pill) border border-hairline px-(--space-4) py-(--space-2) text-sm font-bold text-on-dark hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string; ok?: string; error?: string }>;
}) {
  await requireMaintainAdmin();
  const params = await searchParams;
  const db = createAdminClient();

  const [industries, regions, proficiencies, trades, skills, qualifications] = await Promise.all([
    db.from("industry").select("id, name, is_active").order("name"),
    db.from("region").select("id, name, is_active").order("name"),
    db.from("proficiency").select("id, name, rank, is_active").order("rank"),
    db.from("trade_role").select("id, name, is_active, industry_id").order("name"),
    db.from("skill").select("id, name, is_active, trade_role_id").order("name"),
    db.from("qualification").select("id, name, is_active").order("name"),
  ]);

  const tradeRows: Trade[] = trades.data ?? [];
  const focusTradeId = params.trade ?? tradeRows[0]?.id ?? null;
  const focusTrade = tradeRows.find((t) => t.id === focusTradeId) ?? null;

  const [tradeProfs, tradeQuals] = await Promise.all([
    focusTradeId
      ? db.from("trade_role_proficiency").select("proficiency_id").eq("trade_role_id", focusTradeId)
      : Promise.resolve({ data: [] as { proficiency_id: string }[] }),
    focusTradeId
      ? db
          .from("trade_role_qualification")
          .select("qualification_id, level, is_mandatory")
          .eq("trade_role_id", focusTradeId)
      : Promise.resolve({
          data: [] as { qualification_id: string; level: string; is_mandatory: boolean }[],
        }),
  ]);

  const enabledProfs = new Set((tradeProfs.data ?? []).map((r: { proficiency_id: string }) => r.proficiency_id));
  const mapped = new Map<string, { level: string; is_mandatory: boolean }>();
  for (const row of tradeQuals.data ?? []) {
    mapped.set(`${row.qualification_id}:${row.level}`, {
      level: row.level,
      is_mandatory: row.is_mandatory,
    });
  }

  const here = focusTradeId ? `/admin/catalogue?trade=${focusTradeId}` : "/admin/catalogue";
  const skillRows: (Item & { trade_role_id: string })[] = skills.data ?? [];

  return (
    <div className="flex flex-col gap-(--space-7)">
      <header>
        <h1 className={H1}>Catalogue</h1>
        <p className="mt-(--space-3) max-w-[70ch] text-body-lg text-on-dark-muted">
          Reference data for the whole exchange. Everything here is data, not code — a new
          trade, skill or qualification goes live without a deployment. Items are never
          deleted once they are in use; deactivating one hides it from new entry and leaves
          it on the records that already carry it.
        </p>
      </header>

      <Notice ok={params.ok} error={params.error} />

      {/* 4.1 Industry → TradeRole → Skill ------------------------------------------ */}
      <div className="grid gap-(--space-5) lg:grid-cols-3">
        <CatalogueColumn
          title="Industries"
          table="industry"
          items={industries.data ?? []}
          here={here}
          addAction={createIndustry}
          addLabel="Industry name"
        />

        <section className={`${PANEL} p-(--space-5)`}>
          <h2 className="font-display text-h3 font-bold text-on-dark">Trades</h2>
          <p className={`${LABEL} mt-(--space-2)`}>Each trade belongs to one industry</p>
          <form action={createTradeRole} className="mt-(--space-4) flex flex-col gap-(--space-3)">
            <input type="hidden" name="return_to" value={here} />
            <label className="sr-only" htmlFor="trade-industry">
              Industry
            </label>
            <select id="trade-industry" name="industry_id" required className={INPUT}>
              <option value="">Choose an industry</option>
              {(industries.data ?? [])
                .filter((i: Item) => i.is_active)
                .map((i: Item) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </select>
            <label className="sr-only" htmlFor="trade-name">
              Trade name
            </label>
            <input id="trade-name" name="name" required placeholder="Trade name" className={INPUT} />
            <button type="submit" className={SMALL_BTN}>
              Add trade
            </button>
          </form>
          <ItemTable items={tradeRows} table="trade_role" here={here} />
        </section>

        <section className={`${PANEL} p-(--space-5)`}>
          <h2 className="font-display text-h3 font-bold text-on-dark">Skills</h2>
          <p className={`${LABEL} mt-(--space-2)`}>Tags a worker or a requirement can carry</p>
          <form action={createSkill} className="mt-(--space-4) flex flex-col gap-(--space-3)">
            <input type="hidden" name="return_to" value={here} />
            <label className="sr-only" htmlFor="skill-trade">
              Trade
            </label>
            <select id="skill-trade" name="trade_role_id" required className={INPUT}>
              <option value="">Choose a trade</option>
              {tradeRows
                .filter((t) => t.is_active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            <label className="sr-only" htmlFor="skill-name">
              Skill name
            </label>
            <input id="skill-name" name="name" required placeholder="Skill name" className={INPUT} />
            <button type="submit" className={SMALL_BTN}>
              Add skill
            </button>
          </form>
          <ItemTable items={skillRows} table="skill" here={here} />
        </section>
      </div>

      {/* 4.1 / 4.4 / 4.5 flat catalogues ------------------------------------------- */}
      <div className="grid gap-(--space-5) lg:grid-cols-3">
        <CatalogueColumn
          title="Qualifications"
          table="qualification"
          items={qualifications.data ?? []}
          here={here}
          addAction={createQualification}
          addLabel="Qualification name"
        />

        <section className={`${PANEL} p-(--space-5)`}>
          <h2 className="font-display text-h3 font-bold text-on-dark">Proficiencies</h2>
          {/* 4.5 — the rank orders the levels and drives the 11.1 higher-proficiency toggle. */}
          <p className={`${LABEL} mt-(--space-2)`}>Rank orders the levels, lowest first</p>
          <form action={createProficiency} className="mt-(--space-4) flex flex-col gap-(--space-3)">
            <input type="hidden" name="return_to" value={here} />
            <label className="sr-only" htmlFor="prof-name">
              Proficiency name
            </label>
            <input id="prof-name" name="name" required placeholder="Level name" className={INPUT} />
            <label className="sr-only" htmlFor="prof-rank">
              Rank
            </label>
            <input
              id="prof-rank"
              name="rank"
              type="number"
              min={1}
              max={99}
              required
              placeholder="Rank"
              className={`${INPUT} ${MONO}`}
            />
            <button type="submit" className={SMALL_BTN}>
              Add proficiency
            </button>
          </form>
          <table className={`${TABLE} mt-(--space-4)`}>
            <thead>
              <tr>
                <th className={TH}>Level</th>
                <th className={TH}>Rank</th>
                <th className={TH}>State</th>
              </tr>
            </thead>
            <tbody>
              {(proficiencies.data ?? []).map((p: Prof) => (
                <tr key={p.id}>
                  <td className={TD}>{p.name}</td>
                  <td className={`${TD} ${MONO}`}>{p.rank}</td>
                  <td className={TD}>
                    <ActiveToggle table="proficiency" item={p} here={here} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <CatalogueColumn
          title="Regions"
          table="region"
          items={regions.data ?? []}
          here={here}
          addAction={createRegion}
          addLabel="Region name"
        />
      </div>

      {/* 4.2 + 4.5 per-trade mapping ------------------------------------------------ */}
      <section className={`${PANEL} p-(--space-6)`}>
        <h2 className={H2}>Trade mapping</h2>
        <p className="mt-(--space-3) max-w-[70ch] text-body text-on-dark-muted">
          Which proficiency levels a trade supports (4.2), and which qualifications it
          requires (4.5). Worker classification, requirement lines and rate bands may only
          use the combinations set here. A mandatory worker-level qualification defines
          what &ldquo;expired mandatory qualification&rdquo; means for that trade; a
          mandatory company-level one names the compliance document the supplying business
          must hold.
        </p>

        <form method="get" className="mt-(--space-5) flex flex-wrap items-end gap-(--space-3)">
          <div className="flex flex-col gap-(--space-2)">
            <label htmlFor="trade" className="text-sm font-semibold text-on-dark">
              Trade
            </label>
            <select id="trade" name="trade" defaultValue={focusTradeId ?? ""} className={INPUT}>
              {tradeRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={BTN_PRIMARY}>
            Show mapping
          </button>
        </form>

        {!focusTrade ? (
          <p className="mt-(--space-5) text-body text-on-dark-muted">
            Add an industry and a trade first — the founders&rsquo; catalogue loads through
            the seed script, and this screen maintains it afterwards.
          </p>
        ) : (
          <div className="mt-(--space-6) grid gap-(--space-6) lg:grid-cols-2">
            <div>
              <h3 className="font-display text-h4 font-bold text-on-dark">
                Proficiency levels for {focusTrade.name}
              </h3>
              <table className={`${TABLE} mt-(--space-4)`}>
                <thead>
                  <tr>
                    <th className={TH}>Level</th>
                    <th className={TH}>Rank</th>
                    <th className={TH}>Supported</th>
                  </tr>
                </thead>
                <tbody>
                  {(proficiencies.data ?? []).map((p: Prof) => {
                    const on = enabledProfs.has(p.id);
                    return (
                      <tr key={p.id}>
                        <td className={TD}>{p.name}</td>
                        <td className={`${TD} ${MONO}`}>{p.rank}</td>
                        <td className={TD}>
                          <form action={setTradeProficiency}>
                            <input type="hidden" name="return_to" value={here} />
                            <input type="hidden" name="trade_role_id" value={focusTrade.id} />
                            <input type="hidden" name="proficiency_id" value={p.id} />
                            <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                            <button type="submit" className={SMALL_BTN}>
                              {on ? "Remove" : "Enable"}
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="font-display text-h4 font-bold text-on-dark">
                Qualifications for {focusTrade.name}
              </h3>
              <table className={`${TABLE} mt-(--space-4)`}>
                <thead>
                  <tr>
                    <th className={TH}>Qualification</th>
                    <th className={TH}>Worker level</th>
                    <th className={TH}>Company level</th>
                  </tr>
                </thead>
                <tbody>
                  {(qualifications.data ?? []).map((q: Item) => (
                    <tr key={q.id}>
                      <td className={TD}>{q.name}</td>
                      {(["worker", "company"] as const).map((level) => {
                        const row = mapped.get(`${q.id}:${level}`);
                        return (
                          <td className={TD} key={level}>
                            <div className="flex flex-col gap-(--space-2)">
                              <span className={pill(row?.is_mandatory ? "overdue" : "neutral")}>
                                {row ? (row.is_mandatory ? "Mandatory" : "Optional") : "Not required"}
                              </span>
                              <form action={setTradeQualification} className="flex gap-(--space-2)">
                                <input type="hidden" name="return_to" value={here} />
                                <input type="hidden" name="trade_role_id" value={focusTrade.id} />
                                <input type="hidden" name="qualification_id" value={q.id} />
                                <input type="hidden" name="level" value={level} />
                                <input
                                  type="hidden"
                                  name="is_mandatory"
                                  value={row?.is_mandatory ? "false" : "true"}
                                />
                                <input type="hidden" name="enabled" value="true" />
                                <button type="submit" className={SMALL_BTN}>
                                  {row?.is_mandatory ? "Make optional" : "Make mandatory"}
                                </button>
                              </form>
                              {row && (
                                <form action={setTradeQualification}>
                                  <input type="hidden" name="return_to" value={here} />
                                  <input type="hidden" name="trade_role_id" value={focusTrade.id} />
                                  <input type="hidden" name="qualification_id" value={q.id} />
                                  <input type="hidden" name="level" value={level} />
                                  <input type="hidden" name="enabled" value="false" />
                                  <button type="submit" className={SMALL_BTN}>
                                    Remove
                                  </button>
                                </form>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces ---- */

function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p
      role="status"
      className="flex items-center gap-(--space-3) rounded-(--radius-md) border border-hairline bg-black-2 px-(--space-4) py-(--space-3) text-body text-on-dark"
    >
      {/* Dot-and-Label: the hue rides on the dot, the sentence stays white (DESIGN.md). */}
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-(--radius-pill) ${error ? "bg-status-critical" : "bg-status-active"}`}
      />
      {error ?? ok}
    </p>
  );
}

function CatalogueColumn({
  title,
  table,
  items,
  here,
  addAction,
  addLabel,
}: {
  title: string;
  table: string;
  items: Item[];
  here: string;
  addAction: (formData: FormData) => Promise<void>;
  addLabel: string;
}) {
  return (
    <section className={`${PANEL} p-(--space-5)`}>
      <h2 className="font-display text-h3 font-bold text-on-dark">{title}</h2>
      <form action={addAction} className="mt-(--space-4) flex flex-col gap-(--space-3)">
        <input type="hidden" name="return_to" value={here} />
        <label className="sr-only" htmlFor={`${table}-name`}>
          {addLabel}
        </label>
        <input id={`${table}-name`} name="name" required placeholder={addLabel} className={INPUT} />
        <button type="submit" className={SMALL_BTN}>
          Add
        </button>
      </form>
      <ItemTable items={items} table={table} here={here} />
    </section>
  );
}

function ItemTable({ items, table, here }: { items: Item[]; table: string; here: string }) {
  if (items.length === 0) {
    return (
      <p className="mt-(--space-4) text-body text-on-dark-muted">
        Nothing yet — loaded by the seed script from the founders&rsquo; spreadsheet.
      </p>
    );
  }
  return (
    <table className={`${TABLE} mt-(--space-4)`}>
      <thead>
        <tr>
          <th className={TH}>Name</th>
          <th className={TH}>State</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className={TD}>
              {/* 4.1 — editing is a data change; the row is the edit surface. */}
              <form action={renameCatalogueItem} className="flex gap-(--space-2)">
                <input type="hidden" name="return_to" value={here} />
                <input type="hidden" name="table" value={table} />
                <input type="hidden" name="id" value={item.id} />
                <label className="sr-only" htmlFor={`${table}-${item.id}-name`}>
                  Name
                </label>
                <input
                  id={`${table}-${item.id}-name`}
                  name="name"
                  defaultValue={item.name}
                  className={INPUT}
                />
                <button type="submit" className={SMALL_BTN}>
                  Save
                </button>
              </form>
            </td>
            <td className={TD}>
              <ActiveToggle table={table} item={item} here={here} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActiveToggle({ table, item, here }: { table: string; item: Item; here: string }) {
  return (
    <div className="flex flex-col items-start gap-(--space-2)">
      <span className={pill(item.is_active ? "active" : "neutral")}>
        {item.is_active ? "In use" : "Hidden"}
      </span>
      <form action={setCatalogueItemActive}>
        <input type="hidden" name="return_to" value={here} />
        <input type="hidden" name="table" value={table} />
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="is_active" value={item.is_active ? "false" : "true"} />
        <button type="submit" className={SMALL_BTN}>
          {item.is_active ? "Hide from new entry" : "Reactivate"}
        </button>
      </form>
    </div>
  );
}
