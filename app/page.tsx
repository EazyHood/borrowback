"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  Download,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  applyChange,
  catalog,
  createCalendar,
  dateLabel,
  dateSchema,
  initialState,
  item,
  parseDate,
  stateSchema,
  STORAGE_KEY,
  timeLabel,
  type Change,
  type ItemId,
  type State,
} from "@/lib/borrowback";
import { resolveViaMcp, windowsViaMcp } from "@/lib/mcp-client";

type Draft = {
  itemId?: ItemId;
  query: string;
  borrower: string;
  dueDate: string;
};
type Match = { id: ItemId; name: string; detail: string };
const blankDraft: Draft = { query: "tripod", borrower: "", dueDate: "" };
const greeting =
  "One projector is out with Maya. We can plan its return, or record something you’ve just lent.";
function download(content: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Home() {
  const [state, setState] = useState<State>(initialState);
  const current = useRef(state);
  const [selected, setSelected] = useState<ItemId>("projector");
  const [mode, setMode] = useState<"home" | "loan" | "plan" | "date">("home");
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState(greeting);
  const [lastUser, setLastUser] = useState("");
  const [pending, setPending] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageNote, setStorageNote] = useState("");
  const [ready, setReady] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [planDate, setPlanDate] = useState("2026-09-12");
  const [windows, setWindows] = useState<Awaited<
    ReturnType<typeof windowsViaMcp>
  > | null>(null);
  const [toolProof, setToolProof] = useState<{
    name: string;
    input: object;
    result: unknown;
    at: string;
  } | null>(null);
  const [undo, setUndo] = useState<State | null>(null);
  const pendingRef = useRef(pending);
  const actions = useRef<{
    send: (text: string) => Promise<void>;
    confirm: () => void;
  }>({ send: async () => {}, confirm: () => {} });
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const restored = stateSchema.parse(JSON.parse(saved));
          current.current = restored;
          setState(restored);
          setReply(
            "Your saved agreements are back. Select an item to continue.",
          );
        }
      } catch {
        setStorageNote(
          "Saved demo data could not be read. Fresh sample data is shown; reset to replace it.",
        );
      }
      setReady(true);
    });
    const sync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const next = stateSchema.parse(JSON.parse(e.newValue));
          current.current = next;
          setState(next);
          setPending(null);
          setUndo(null);
          setReply(
            "Another tab changed the agreement. Review the updated details before continuing.",
          );
        } catch {
          setError(
            "Another tab wrote invalid demo data. Changes were not applied.",
          );
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => {
      mounted = false;
      window.removeEventListener("storage", sync);
    };
  }, []);
  const loan = state.loans.find((l) => l.itemId === selected);
  const active = loan && !loan.returned;
  const gear = item(selected);
  function persist(next: State) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageNote("");
    } catch {
      setStorageNote(
        "Storage is unavailable. Changes last only until this page closes.",
      );
    }
    current.current = next;
    setState(next);
  }
  function stage(change: Change) {
    pendingRef.current = change;
    setPending(change);
    setError("");
    setReply(
      change.kind === "receive"
        ? "Have you actually received this item? Confirm only after checking it. A saved plan is not proof of return."
        : "Review this change. The agreement stays as it is until you confirm.",
    );
  }
  function confirm() {
    if (!pendingRef.current) return;
    try {
      const change = pendingRef.current;
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* Device storage may be unavailable; the in-memory demo still works. */
      }
      if (
        saved &&
        stateSchema.parse(JSON.parse(saved)).revision !==
          current.current.revision
      )
        throw new Error(
          "Another tab changed the data. Reload and review it first.",
        );
      const previous = current.current;
      const next = applyChange(previous, change);
      pendingRef.current = null;
      setPending(null);
      setUndo(previous);
      persist(next);
      setMode("home");
      setWindows(null);
      setReply(
        change.kind === "receive"
          ? `${item(change.itemId).name} is marked received in this demo. Your confirmation is recorded below.`
          : change.kind === "plan"
            ? "The return plan is saved on this device. The item is still on loan. You can download a calendar draft; the borrower has not been contacted."
            : "The agreement is updated on this device. You can undo this last change.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }
  async function startLoan(next: Draft) {
    setBusy(true);
    setError("");
    setPending(null);
    setMode("loan");
    setDraft(next);
    try {
      const found = await resolveViaMcp(next.query);
      setToolProof({
        name: "resolve_item",
        input: { query: next.query },
        result: found,
        at: new Date().toISOString(),
      });
      setMatches(found);
      if (found.length === 1) {
        next = { ...next, itemId: found[0].id };
        setDraft(next);
        setSelected(found[0].id);
      }
      setReply(
        found.length > 1
          ? "There are two tripods. Which one did you lend? We also need a borrower and a clear return date before saving."
          : found.length === 0
            ? "I couldn’t match that item. This demo contains a pocket projector, tall tripod and tabletop tripod. Try one of those names."
            : "Let’s make the agreement clear. Check the person and the full date, then review the loan.",
      );
    } catch {
      setError(
        "The item tool is unavailable. Please try again; no loan has been saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function startPlan(date: string, id = selected) {
    if (!dateSchema.safeParse(date).success) {
      setError("Choose a date from September 9–13, 2026, the fixed demo week.");
      return;
    }
    setBusy(true);
    setError("");
    setPending(null);
    setMode("plan");
    setSelected(id);
    setPlanDate(date);
    setWindows(null);
    try {
      const result = await windowsViaMcp(id, date);
      setWindows(result);
      setToolProof({
        name: "find_return_windows",
        input: { itemId: id, date },
        result,
        at: new Date().toISOString(),
      });
      setReply(
        result.slots.length
          ? "These windows fit both sample schedules. Pick one to review a local handoff plan."
          : "There’s no shared time that day. I haven’t invented a time or saved a plan. Try Saturday or choose another demo date.",
      );
    } catch {
      setError(
        "The availability tool is unavailable. Try again; the agreement has not changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(text: string) {
    if (busy || !text.trim()) return;
    setMessage("");
    setLastUser(text.trim());
    setError("");
    const t = text.toLowerCase().trim();
    const match = text.match(
      /^(?:i\s+)?(?:lent|loaned)\s+(.+?)\s+to\s+(.+?)(?:\s+(?:until|through|till)\s+(.+))?$/i,
    );
    if (match) {
      await startLoan({
        query: match[1],
        borrower: match[2].trim(),
        dueDate: parseDate(match[3] ?? "") ?? "",
      });
      return;
    }
    if (/\b(plan|schedule)\b/.test(t) && /\b(return|handoff)\b/.test(t)) {
      await startPlan(
        parseDate(text) ?? "2026-09-12",
        t.includes("projector") ? "projector" : selected,
      );
      return;
    }
    if (
      /^(make (?:that|it)|actually|change|better|instead)/i.test(text) &&
      parseDate(text)
    ) {
      const date = parseDate(text)!;
      if (mode === "loan") {
        setDraft((d) => ({ ...d, dueDate: date }));
        setPending(null);
        setReply(
          `Updated the draft to ${dateLabel(date)}. It still needs your review.`,
        );
      } else if (active) {
        stage({
          kind: "date",
          itemId: selected,
          dueDate: date,
          baseRevision: state.revision,
        });
      }
      return;
    }
    if (/^(?:i (?:have )?)?(?:received|got back)/i.test(t) && active) {
      stage({
        kind: "receive",
        itemId: selected,
        baseRevision: state.revision,
      });
      return;
    }
    if (t === "help") {
      setReply(
        "Try ‘I lent the tripod to Alex until Friday’, ‘Plan the projector return on Friday’, or ‘Make that Saturday’. Dates use the fixed demo week. You can always use the buttons and fields.",
      );
      return;
    }
    setReply(
      "I didn’t understand that within this guided demo. Nothing changed. Use the actions below, or type ‘help’ for supported examples.",
    );
  }
  useEffect(() => {
    actions.current = { send, confirm };
  });
  useEffect(() => {
    type Registry = {
      registerTool: (
        tool: {
          name: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean };
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: Registry })
      .modelContext;
    if (!context) return;
    const life = new AbortController();
    const tools = [
      {
        name: "read_demo_agreements",
        description:
          "Read the visible device-local sample agreements and any staged change.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: (input: unknown) => {
          if (
            typeof input !== "object" ||
            input === null ||
            Array.isArray(input) ||
            Object.keys(input).length
          )
            throw new Error("Expected an empty object.");
          return { state: current.current, pending: pendingRef.current };
        },
      },
      {
        name: "stage_demo_conversation",
        description:
          "Send a supported guided-demo message, updating the visible proposal. Does not confirm or save a loan.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", minLength: 1, maxLength: 240 },
          },
          required: ["message"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          if (
            typeof input !== "object" ||
            input === null ||
            !("message" in input) ||
            typeof input.message !== "string" ||
            !input.message.trim() ||
            input.message.length > 240
          )
            throw new Error("A message of 1–240 characters is required.");
          await actions.current.send(input.message);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          return { state: current.current, pending: pendingRef.current };
        },
      },
      {
        name: "confirm_demo_change",
        description:
          "Commit the currently reviewed proposal to this device. Requires the user’s explicit confirmation. Never sends messages or creates external calendar events.",
        inputSchema: {
          type: "object",
          properties: { confirm: { const: true } },
          required: ["confirm"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          if (
            typeof input !== "object" ||
            input === null ||
            !("confirm" in input) ||
            input.confirm !== true
          )
            throw new Error("Explicit confirmation required.");
          if (!pendingRef.current) throw new Error("No proposal is staged.");
          actions.current.confirm();
          if (pendingRef.current)
            throw new Error(
              "The proposal could not be confirmed; review the visible error.",
            );
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          return { state: current.current, pending: pendingRef.current };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: life.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => life.abort();
  }, []);
  function select(id: ItemId) {
    if (busy) return;
    setSelected(id);
    setPending(null);
    setMode("home");
    setWindows(null);
    setLastUser("");
    const l = state.loans.find((x) => x.itemId === id);
    setReply(
      l && !l.returned
        ? `${item(id).name} is with ${l.borrower}. Its return is due ${dateLabel(l.dueDate)}. What would you like to clarify?`
        : `${item(id).name} is available. You can record a new loan.`,
    );
  }
  function reviewLoan() {
    if (!draft.itemId) {
      setError("Choose which item first.");
      return;
    }
    if (
      !draft.borrower.trim() ||
      !dateSchema.safeParse(draft.dueDate).success
    ) {
      setError("Add the borrower and a date from September 9–13, 2026.");
      return;
    }
    const change: Change = {
      kind: "loan",
      itemId: draft.itemId,
      borrower: draft.borrower.trim(),
      dueDate: draft.dueDate,
      baseRevision: state.revision,
    };
    try {
      applyChange(state, change);
      stage(change);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid loan.");
    }
  }
  function undoLast() {
    if (!undo) return;
    const next = {
      ...undo,
      revision: state.revision + 1,
      history: [
        ...state.history,
        {
          at: new Date().toISOString(),
          text: "Last change undone; the previous agreement was restored.",
        },
      ].slice(-100),
    };
    persist(next);
    setUndo(null);
    setPending(null);
    setReply("The last saved change was undone.");
  }
  function exportIcs() {
    if (!loan) return;
    try {
      download(
        createCalendar(loan),
        "text/calendar;charset=utf-8",
        "borrowback-return.ics",
      );
      setReply(
        "Calendar draft downloaded. Import it in your calendar if you want. No one was contacted, and the item is still on loan.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export.");
    }
  }
  const preview = pending
    ? pending.kind === "loan"
      ? `${item(pending.itemId).name} → ${pending.borrower}\nDue ${dateLabel(pending.dueDate)}`
      : pending.kind === "date"
        ? `Due date: ${loan ? dateLabel(loan.dueDate) : ""} → ${dateLabel(pending.dueDate)}\nAny previous handoff will be cleared.`
        : pending.kind === "plan"
          ? `${dateLabel(pending.plan.start.slice(0, 10))}\n${timeLabel(pending.plan.start)}–${timeLabel(pending.plan.end)} · ${pending.plan.location}\nAmerica/Bogota · Still on loan`
          : pending.kind === "cancel"
            ? "Remove the saved handoff. Keep the item on loan."
            : `Mark ${item(pending.itemId).name} as received by you.`
    : "";
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="wordmark" href="/">
          <span className="brand-icon">
            <RotateCcw size={22} />
          </span>
          BorrowBack<span className="beta">DEMO</span>
        </Link>
        <div className="header-actions">
          <span className="simulation-label">Simulated Alexa+ experience</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResetOpen(true)}
            disabled={busy}
          >
            <RotateCcw size={15} />
            <span>Reset demo</span>
          </Button>
        </div>
      </header>
      <main className="workspace">
        <aside className="collection">
          <div className="section-label">
            YOUR COLLECTION <span>03</span>
          </div>
          <h1>
            Good things.
            <br />
            Back where they belong.
          </h1>
          <div className="collection-art">
            <Image
              unoptimized
              src="/gear.png"
              width={1536}
              height={1024}
              alt="A black projector and two different camera tripods on a blue background"
            />
          </div>
          <div className="collection-caption">SAMPLE COLLECTION</div>
          {catalog.map((it, i) => {
            const l = state.loans.find((x) => x.itemId === it.id);
            return (
              <button
                key={it.id}
                aria-pressed={selected === it.id}
                className={`gear-row ${selected === it.id ? "selected" : ""}`}
                onClick={() => select(it.id)}
                disabled={busy}
              >
                <span className="item-number">0{i + 1}</span>
                <span className="gear-info">
                  <strong>{it.name}</strong>
                  <small>
                    {l && !l.returned
                      ? `With ${l.borrower} · Due Sep ${Number(l.dueDate.slice(-2))}`
                      : it.detail}
                  </small>
                </span>
                <span className={`status ${l && !l.returned ? "loan" : ""}`}>
                  {l && !l.returned ? "On loan" : "Available"}
                </span>
              </button>
            );
          })}
          <p className="collection-foot">
            <Package size={16} /> Sample data · Stored on this device
          </p>
          <div className="demo-date">
            <strong>Wednesday, September 9, 2026</strong>
            <span>Fixed demo clock · America/Bogota</span>
          </div>
        </aside>
        <section className="conversation" aria-busy={busy}>
          <div className="conversation-heading">
            <div>
              <span className="section-label">LET’S GET IT SORTED</span>
              <h2>A little clarity goes a long way.</h2>
            </div>
            <span className="conversation-symbol">
              <RotateCcw size={25} />
            </span>
          </div>
          <div className="conversation-body">
            {lastUser && <p className="user-message">{lastUser}</p>}
            <div className="assistant-message" aria-live="polite">
              <span className="speaker">BORROWBACK</span>
              <p>{busy ? "Checking the sample data…" : reply}</p>
            </div>
            {busy && (
              <div className="loading">
                <Loader2 size={18} className="animate-spin" />
                Preparing a proposal
              </div>
            )}
            {!busy && !pending && mode === "home" && (
              <div className="starter-actions">
                {active ? (
                  <>
                    <Button
                      className="start-action"
                      onClick={() => startPlan(loan.dueDate)}
                    >
                      <Clock3 size={18} />
                      Plan a return
                      <ArrowUpRight size={17} />
                    </Button>
                    <Button
                      variant="outline"
                      className="start-action"
                      onClick={() => {
                        setMode("date");
                        setPlanDate(loan.dueDate);
                        setReply(
                          "Choose a new due date. You’ll review the change before saving it.",
                        );
                      }}
                    >
                      <CalendarDays size={18} />
                      Change date
                    </Button>
                    <Button
                      variant="outline"
                      className="start-action"
                      onClick={() =>
                        stage({
                          kind: "receive",
                          itemId: selected,
                          baseRevision: state.revision,
                        })
                      }
                    >
                      <CheckCheck size={18} />I received it
                    </Button>
                  </>
                ) : (
                  <Button
                    className="start-action"
                    onClick={() =>
                      startLoan({
                        itemId: selected,
                        query: gear.name,
                        borrower: "",
                        dueDate: "",
                      })
                    }
                  >
                    <Plus size={18} />
                    Record a loan
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="example-action"
                  onClick={() => send("I lent the tripod to Alex until Friday")}
                >
                  Try: “I lent the tripod to Alex until Friday”
                </Button>
              </div>
            )}
            {!busy && !pending && mode === "loan" && (
              <div className="loan-form">
                {matches.length > 1 && (
                  <fieldset>
                    <legend>Which item?</legend>
                    <RadioGroup
                      value={draft.itemId ?? ""}
                      onValueChange={(v) => {
                        const id = v as ItemId;
                        setDraft((d) => ({ ...d, itemId: id }));
                        setSelected(id);
                      }}
                      className="item-options"
                    >
                      {matches.map((m) => (
                        <label className="item-option" key={m.id}>
                          <RadioGroupItem value={m.id} />
                          <span>
                            <strong>{m.name}</strong>
                            <small>{m.detail}</small>
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </fieldset>
                )}
                <div className="field-pair">
                  <label>
                    Borrower
                    <Input
                      value={draft.borrower}
                      maxLength={60}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, borrower: e.target.value }))
                      }
                      placeholder="e.g. Alex"
                    />
                  </label>
                  <label>
                    Return by
                    <Input
                      type="date"
                      value={draft.dueDate}
                      min="2026-09-09"
                      max="2026-09-13"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, dueDate: e.target.value }))
                      }
                    />
                  </label>
                </div>
                <p className="field-help">
                  Demo week: September 9–13, 2026. Names stay in this browser.
                </p>
                <div className="action-row">
                  <Button onClick={reviewLoan}>
                    Review loan
                    <ArrowUpRight size={16} />
                  </Button>
                  <Button variant="ghost" onClick={() => select(selected)}>
                    Cancel draft
                  </Button>
                </div>
              </div>
            )}
            {!busy && !pending && (mode === "plan" || mode === "date") && (
              <div className="plan-form">
                <label>
                  {mode === "date" ? "New due date" : "Handoff day"}
                  <Input
                    type="date"
                    min="2026-09-09"
                    max="2026-09-13"
                    value={planDate}
                    onChange={(e) => {
                      setPlanDate(e.target.value);
                      setWindows(null);
                    }}
                  />
                </label>
                <div className="action-row">
                  <Button
                    onClick={() =>
                      mode === "date"
                        ? stage({
                            kind: "date",
                            itemId: selected,
                            dueDate: dateSchema.parse(planDate),
                            baseRevision: state.revision,
                          })
                        : startPlan(planDate)
                    }
                    disabled={!dateSchema.safeParse(planDate).success}
                  >
                    {mode === "date"
                      ? "Review date change"
                      : "Check availability"}
                  </Button>
                  <Button variant="ghost" onClick={() => select(selected)}>
                    Cancel
                  </Button>
                </div>
                {mode === "plan" && (
                  <>
                    <div className="date-shortcuts">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startPlan("2026-09-11")}
                      >
                        Fri 11
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startPlan("2026-09-12")}
                      >
                        Sat 12
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startPlan("2026-09-13")}
                      >
                        Sun 13
                      </Button>
                    </div>
                    {windows && (
                      <div className="availability">
                        <div className="section-label">SAMPLE AVAILABILITY</div>
                        <p>
                          You: {windows.owner[0]}:00–{windows.owner[1]}:00
                          <br />
                          {loan?.borrower ?? "Borrower"}: {windows.borrower[0]}
                          :00–{windows.borrower[1]}:00
                        </p>
                        {windows.reservedFrom && (
                          <p>Next projector reservation: 18:00.</p>
                        )}
                        <small>
                          America/Bogota · Synthetic schedules, not connected
                          calendars
                        </small>
                        {windows.slots.length === 0 ? (
                          <div className="no-match">
                            No overlap. No plan saved.
                          </div>
                        ) : (
                          <div className="slot-list">
                            {windows.slots.map((s) => (
                              <Button
                                variant="outline"
                                key={s.start}
                                onClick={() => {
                                  try {
                                    const c: Change = {
                                      kind: "plan",
                                      itemId: selected,
                                      plan: s,
                                      baseRevision: state.revision,
                                    };
                                    applyChange(state, c);
                                    stage(c);
                                  } catch (e) {
                                    setError(
                                      e instanceof Error
                                        ? e.message
                                        : "Invalid window.",
                                    );
                                  }
                                }}
                              >
                                {timeLabel(s.start)}–{timeLabel(s.end)}
                                <ArrowUpRight size={15} />
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {pending && (
              <div
                className={`review-card ${pending.kind === "receive" ? "receive-review" : ""}`}
              >
                <span className="section-label">
                  {pending.kind === "receive"
                    ? "CONFIRM RECEIPT"
                    : "REVIEW BEFORE SAVING"}
                </span>
                <p>{preview}</p>
                <div className="action-row">
                  <Button onClick={confirm}>
                    {pending.kind === "receive"
                      ? "Yes, I have received it"
                      : "Confirm change"}
                    <Check size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPending(null);
                      setReply(
                        "The proposal was discarded. Your saved agreement is unchanged.",
                      );
                    }}
                  >
                    Go back
                  </Button>
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            {storageNote && (
              <p role="status" className="storage-message">
                {storageNote}
              </p>
            )}
            {undo && !pending && (
              <Button
                variant="ghost"
                size="sm"
                onClick={undoLast}
                className="undo-button"
              >
                <RotateCcw size={14} />
                Undo last change
              </Button>
            )}
            {mode === "home" && !pending && (
              <div className="conversation-note">
                <Check size={17} />
                <p>
                  You review changes before they are saved.
                  <br />
                  <span>
                    Planning a return never marks an item as received.
                  </span>
                </p>
              </div>
            )}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send(message);
            }}
          >
            <label className="sr-only" htmlFor="message">
              Message BorrowBack
            </label>
            <input
              id="message"
              value={message}
              maxLength={240}
              disabled={busy || !ready}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Try ‘I lent the tripod to Alex until Friday’"
            />
            <Button
              size="icon"
              type="submit"
              disabled={busy || !ready || !message.trim()}
              aria-label="Send message"
            >
              <ArrowUp size={20} />
            </Button>
          </form>
          <p className="composer-foot">
            Guided simulation · No messages or calendar events are sent.
          </p>
        </section>
        <aside className="agreement" aria-live="polite">
          <span className="section-label">THE AGREEMENT</span>
          <div className="agreement-top">
            <span className={`status ${active ? "loan" : ""}`}>
              {active ? "On loan" : loan?.returned ? "Received" : "Available"}
            </span>
            <Package size={26} />
          </div>
          <h2>{gear.name}</h2>
          <p className="borrower">
            {active
              ? `With ${loan.borrower}`
              : loan?.returned
                ? "Marked received by you"
                : "Ready to lend"}
          </p>
          <dl>
            <div>
              <dt>Return by</dt>
              <dd>{loan ? dateLabel(loan.dueDate) : "No active loan"}</dd>
            </div>
            <div>
              <dt>Handoff</dt>
              <dd className={!loan?.plan ? "pending" : ""}>
                {loan?.plan ? (
                  <>
                    {dateLabel(loan.plan.start.slice(0, 10))}
                    <br />
                    {timeLabel(loan.plan.start)}–{timeLabel(loan.plan.end)}
                    <br />
                    {loan.plan.location}
                    <small className="block">
                      Local plan · Other person not contacted
                    </small>
                  </>
                ) : (
                  "Not planned"
                )}
              </dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd className={active ? "pending" : ""}>
                {active
                  ? "Not confirmed"
                  : loan?.returned
                    ? "Confirmed by you in demo"
                    : "—"}
              </dd>
            </div>
          </dl>
          {active && loan.plan && (
            <div className="agreement-actions">
              <Button variant="outline" onClick={exportIcs}>
                <Download size={16} />
                Calendar draft
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  stage({
                    kind: "cancel",
                    itemId: selected,
                    baseRevision: state.revision,
                  })
                }
              >
                <X size={14} />
                Cancel handoff
              </Button>
            </div>
          )}
          <div className="receipt-strip">
            <Clock3 size={19} />
            <p>
              A plan is a plan.
              <br />
              <strong>Received means confirmed.</strong>
            </p>
          </div>
          <details className="history">
            <summary>
              Agreement history <span>{state.history.length}</span>
            </summary>
            <ol>
              {state.history
                .slice()
                .reverse()
                .map((h, i) => (
                  <li key={i}>
                    <p>{h.text}</p>
                    <small>
                      {h.at === "Sample record"
                        ? h.at
                        : new Date(h.at).toLocaleString("en-US", {
                            timeZone: "America/Bogota",
                          })}
                    </small>
                  </li>
                ))}
            </ol>
          </details>
        </aside>
      </main>
      <footer className="app-footer">
        <div>
          <span>Built for the things we share.</span>
          <details className="demo-details">
            <summary>How this demo works</summary>
            <p>
              The conversation uses guided, deterministic intents. Real MCP
              tools resolve the sample catalog and calculate overlaps; this is
              not a live Alexa integration or language model. Item names and
              dates reach the stateless server; borrower names and saved
              agreements stay in this browser. Device storage is not a shared
              calendar or a multi-user database.
            </p>
            <p>
              Fixed demo week: September 9–13, 2026, America/Bogota. No physical
              return is verified. Calendar downloads are tentative drafts.
            </p>
            {toolProof ? (
              <>
                <strong>Latest real tool call: {toolProof.name}</strong>
                <pre>{JSON.stringify(toolProof, null, 2)}</pre>
              </>
            ) : (
              <p>
                Use a loan or return action to see a real MCP tool result here.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download(
                  JSON.stringify(current.current, null, 2),
                  "application/json",
                  "borrowback-demo.json",
                )
              }
            >
              Export device data
            </Button>
          </details>
        </div>
        <span>Independent hackathon prototype · Synthetic sample data</span>
      </footer>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Reset the demo?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes this browser’s saved demo agreements and restores the
            three sample objects. Export any data you want to keep first.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my changes</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const fresh = initialState();
                fresh.revision = current.current.revision + 1;
                persist(fresh);
                setSelected("projector");
                setPending(null);
                setUndo(null);
                setToolProof(null);
                setMode("home");
                setReply(greeting);
                setLastUser("");
                setError("");
              }}
            >
              Reset sample data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
