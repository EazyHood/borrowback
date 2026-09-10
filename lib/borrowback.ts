import { z } from "zod";

export const DEMO_TODAY = "2026-09-09";
export const STORAGE_KEY = "borrowback-demo-v1";
export const catalog = [
  {
    id: "projector",
    name: "Pocket projector",
    detail: "Black · Includes power cable",
    aliases: ["projector", "pocket projector"],
  },
  {
    id: "tall-tripod",
    name: "Tall tripod",
    detail: "Graphite · 155 cm",
    aliases: ["tripod", "tall tripod", "graphite tripod"],
  },
  {
    id: "tabletop-tripod",
    name: "Tabletop tripod",
    detail: "Silver · 24 cm",
    aliases: ["tripod", "tabletop tripod", "small tripod", "silver tripod"],
  },
] as const;
export const itemIdSchema = z.enum([
  "projector",
  "tall-tripod",
  "tabletop-tripod",
]);
export type ItemId = z.infer<typeof itemIdSchema>;
export const dateSchema = z
  .string()
  .regex(
    /^2026-09-(09|1[0-3])$/,
    "Use September 9–13 in this fixed demo week.",
  );
const planSchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  location: z.literal("Community room"),
});
const loanSchema = z.object({
  itemId: itemIdSchema,
  borrower: z.string().trim().min(1).max(60),
  dueDate: dateSchema,
  returned: z.boolean(),
  plan: planSchema.nullable(),
});
const eventSchema = z.object({ at: z.string(), text: z.string().max(240) });
export const stateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    loans: z.array(loanSchema).max(3),
    history: z.array(eventSchema).max(100),
  })
  .refine(
    (s) => new Set(s.loans.map((l) => l.itemId)).size === s.loans.length,
    "Duplicate items",
  );
export type Loan = z.infer<typeof loanSchema>;
export type State = z.infer<typeof stateSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Change =
  | {
      baseRevision: number;
      itemId: ItemId;
      kind: "loan";
      borrower: string;
      dueDate: string;
    }
  | { baseRevision: number; itemId: ItemId; kind: "date"; dueDate: string }
  | { baseRevision: number; itemId: ItemId; kind: "plan"; plan: Plan }
  | { baseRevision: number; itemId: ItemId; kind: "cancel" | "receive" };
export function initialState(): State {
  return {
    revision: 0,
    loans: [
      {
        itemId: "projector",
        borrower: "Maya Chen",
        dueDate: "2026-09-12",
        returned: false,
        plan: null,
      },
    ],
    history: [
      {
        at: "Sample record",
        text: "Pocket projector lent to Maya Chen, due September 12.",
      },
    ],
  };
}
export function item(id: ItemId) {
  return catalog.find((x) => x.id === id)!;
}
export function resolveItem(query: string) {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/^(the|a) /, "");
  return catalog
    .filter((i) => i.aliases.some((a) => a === q))
    .map(({ id, name, detail }) => ({ id, name, detail }));
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    timeZone: "America/Bogota",
  }).format(new Date(date + "T12:00:00-05:00"));
}
export function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}
export function parseDate(text: string): string | undefined {
  const t = text.toLowerCase().trim();
  if (t.includes("next friday")) return undefined;
  const exact = t.match(/2026-09-\d{2}/)?.[0];
  if (exact) return dateSchema.safeParse(exact).success ? exact : undefined;
  const names: Record<string, string> = {
    today: "09",
    tomorrow: "10",
    wednesday: "09",
    thursday: "10",
    friday: "11",
    saturday: "12",
    sunday: "13",
  };
  for (const [name, day] of Object.entries(names))
    if (new RegExp(`\\b${name}\\b`).test(t)) return `2026-09-${day}`;
  return undefined;
}
export const availability: Record<
  string,
  { owner: [number, number]; borrower: [number, number] }
> = {
  "2026-09-09": { owner: [15, 16], borrower: [17, 18] },
  "2026-09-10": { owner: [15, 16], borrower: [17, 18] },
  "2026-09-11": { owner: [15, 16], borrower: [17, 18] },
  "2026-09-12": { owner: [15, 17], borrower: [16, 18] },
  "2026-09-13": { owner: [10, 12], borrower: [11, 13] },
};
export function returnWindows(itemId: ItemId, date: string) {
  itemIdSchema.parse(itemId);
  dateSchema.parse(date);
  const a = availability[date];
  const reservedFrom =
    itemId === "projector" && date === "2026-09-12" ? 18 : null;
  const start = Math.max(a.owner[0], a.borrower[0]);
  const end = Math.min(a.owner[1], a.borrower[1], reservedFrom ?? 24);
  const slots: Plan[] = [];
  for (let hour = start; hour + 0.5 <= end; hour += 0.5) {
    const iso = (n: number) =>
      `${date}T${String(Math.floor(n)).padStart(2, "0")}:${n % 1 ? "30" : "00"}:00-05:00`;
    slots.push({
      start: iso(hour),
      end: iso(hour + 0.5),
      location: "Community room",
    });
  }
  return {
    date,
    timezone: "America/Bogota",
    source: "Synthetic availability",
    owner: a.owner,
    borrower: a.borrower,
    reservedFrom,
    slots,
  };
}
export function applyChange(
  state: State,
  change: Change,
  at = new Date().toISOString(),
): State {
  stateSchema.parse(state);
  itemIdSchema.parse(change.itemId);
  if (change.baseRevision !== state.revision)
    throw new Error(
      "This preview is out of date. Review the current agreement again.",
    );
  const existing = state.loans.find((l) => l.itemId === change.itemId);
  let next: Loan;
  let text: string;
  const name = item(change.itemId).name;
  if (change.kind === "loan") {
    if (existing && !existing.returned)
      throw new Error("This item is already on loan.");
    next = loanSchema.parse({
      itemId: change.itemId,
      borrower: change.borrower,
      dueDate: change.dueDate,
      returned: false,
      plan: null,
    });
    text = `${name} lent to ${next.borrower}, due ${dateLabel(next.dueDate)}.`;
  } else {
    if (!existing || existing.returned)
      throw new Error("There is no active loan for this item.");
    next = { ...existing };
    if (change.kind === "date") {
      dateSchema.parse(change.dueDate);
      next.dueDate = change.dueDate;
      next.plan = null;
      text = `${name}: due date changed from ${dateLabel(existing.dueDate)} to ${dateLabel(change.dueDate)}. Previous handoff cleared.`;
    } else if (change.kind === "plan") {
      planSchema.parse(change.plan);
      const date = change.plan.start.slice(0, 10);
      if (date > existing.dueDate)
        throw new Error(
          "That handoff is after the due date. Review a due-date change first.",
        );
      if (
        !returnWindows(change.itemId, date).slots.some(
          (s) => JSON.stringify(s) === JSON.stringify(change.plan),
        )
      )
        throw new Error("This window does not match both sample schedules.");
      next.plan = { ...change.plan };
      text = `${name}: local return plan saved for ${dateLabel(date)}, ${timeLabel(change.plan.start)}. Still on loan; other person not contacted.`;
    } else if (change.kind === "cancel") {
      if (!existing.plan) throw new Error("There is no return plan to cancel.");
      next.plan = null;
      text = `${name}: return plan cancelled. Item remains on loan.`;
    } else {
      next.returned = true;
      next.plan = null;
      text = `${name}: marked received by you in this demo.`;
    }
  }
  return stateSchema.parse({
    revision: state.revision + 1,
    loans: [...state.loans.filter((l) => l.itemId !== change.itemId), next],
    history: [...state.history, { at, text }].slice(-100),
  });
}
export function createCalendar(loan: Loan, stamp = new Date().toISOString()) {
  if (!loan.plan || loan.returned)
    throw new Error("Save a return plan before exporting.");
  const escape = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const utc = (s: string) =>
    new Date(s)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const rows = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BorrowBack//Demo//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${loan.itemId}-${utc(loan.plan.start)}@borrowback.demo`,
    `DTSTAMP:${utc(stamp)}`,
    `DTSTART:${utc(loan.plan.start)}`,
    `DTEND:${utc(loan.plan.end)}`,
    `SUMMARY:${escape(`Return ${item(loan.itemId).name}`)}`,
    `DESCRIPTION:${escape(`Demo plan with ${loan.borrower}. Importing this file does not contact them or confirm a physical return.`)}`,
    "LOCATION:Community room",
    "STATUS:TENTATIVE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // RFC5545: fold by UTF-8 octets, never split a Unicode code point.
  return (
    rows
      .map((row) => {
        let result = "",
          bytes = 0;
        for (const char of row) {
          const size = new TextEncoder().encode(char).length;
          if (bytes + size > 74) {
            result += "\r\n ";
            bytes = 1;
          }
          result += char;
          bytes += size;
        }
        return result;
      })
      .join("\r\n") + "\r\n"
  );
}
