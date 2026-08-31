import { describe, expect, it } from "vitest";
import {
  COMPANY_EXPORT_COLUMNS,
  WORKER_EXPORT_COLUMNS,
  csvResponse,
  toCsv,
  type CompanyExportRow,
  type WorkerExportRow,
} from "./csv";

describe("admin CSV reports", () => {
  it("keeps company headers stable and RFC 4180-escapes every cell", () => {
    const row: CompanyExportRow = {
      id: "company-1",
      legal_name: "ACME, \"North\"\nWorks",
      trading_name: null,
      abn: "00123456789",
      status: "Active",
      industry_name: "Electrical",
      primary_region_name: "Perth",
      contact_name: "Alex Example",
      contact_email: "alex@example.test",
      contact_phone: null,
      worker_count: 2,
      created_at: "2026-08-28T00:00:00.000Z",
    };

    const csv = toCsv(COMPANY_EXPORT_COLUMNS, [row]);
    expect(csv.split("\r\n")[0]).toBe(
      '"Company id","Legal name","Trading name","ABN","Status","Industry","Primary region","Contact name","Contact email","Contact phone","Crew on record","Registered"',
    );
    expect(csv).toContain('"ACME, ""North""\nWorks"');
    expect(csv).toContain('"00123456789"');
    expect(csv.endsWith("\r\n")).toBe(true);

    expect(
      toCsv([{ header: "ABN", value: (company: CompanyExportRow) => company.abn }], [
        { ...row, abn: null },
      ]),
    ).toBe('"ABN"\r\n""\r\n');
  });

  it("neutralizes spreadsheet formulas without changing numeric cells", () => {
    const csv = toCsv(
      [
        { header: "Name", value: (row: { name: string; balance: number }) => row.name },
        {
          header: "Balance",
          value: (row: { name: string; balance: number }) => row.balance,
        },
      ],
      [
        { name: "=1+1", balance: -25 },
        { name: "+SUM(A1:A2)", balance: 10 },
        { name: "-2+3", balance: 5 },
        { name: "@SUM(A1:A2)", balance: 0 },
      ],
    );

    expect(csv).toContain('"\'=1+1","-25"');
    expect(csv).toContain('"\'+SUM(A1:A2)","10"');
    expect(csv).toContain('"\'-2+3","5"');
    expect(csv).toContain('"\'@SUM(A1:A2)","0"');
  });

  it("neutralizes formulas hidden behind leading whitespace and control characters", () => {
    const values = ["\t=1+1", "\r+SUM(A1:A2)", "\n-2+3", " @SUM(A1:A2)", " \t\r\n=HYPERLINK(\"x\")", "\uFEFF=1+1"];
    for (const value of values) {
      expect(toCsv([{ header: "Text", value: (row: string) => row }], [value])).toBe(
        `"Text"\r\n"'${value.replaceAll('"', '""')}"\r\n`,
      );
    }
    expect(toCsv([{ header: "Amount", value: (row: number) => row }], [-25])).toBe('"Amount"\r\n"-25"\r\n');
  });

  it("keeps worker contact data Maintain-only and never invents a rating column", () => {
    const row: WorkerExportRow = {
      id: "worker-1",
      first_name: "Casey",
      last_name: "O'Brien",
      mobile: "+61 400 000 000",
      email: "casey@example.test",
      status: "Active",
      employer_name: "A&B Services",
      employer_id: "company-1",
      base_region_name: "Perth",
      trade_role_name: "Electrician",
      proficiency_name: "Qualified",
      proficiency_overridden_by_maintain: false,
      qualifications_current: 1,
      qualifications_expiring: 0,
      qualifications_expired: 0,
      created_at: "2026-08-28T00:00:00.000Z",
    };

    const csv = toCsv(WORKER_EXPORT_COLUMNS, [row]);
    const header = csv.split("\r\n")[0];
    expect(header).toContain('"Mobile","Email"');
    expect(header.toLowerCase()).not.toContain("rating");
    expect(csv).toContain('"A&B Services"');
  });

  it("sets stable download headers and disables caching", () => {
    const response = csvResponse("companies-2026-08-28.csv", '"Company id"\r\n');

    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="companies-2026-08-28.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
