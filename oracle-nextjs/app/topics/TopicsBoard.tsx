"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { csrfHeaders } from "../lib/csrf";

export type TopicDate = { date: string; count: number };

export type TopicRow = {
  tp_id: number;
  source: string | null;
  content: string | null;
  url: string | null;
  created_date: string | null;
  // Only present for logged-in users.
  ai_suggestion?: string | null;
  ai_status?: "pending" | "running" | "done" | "error" | null;
  ai_question?: string | null;
};

// One page of GET /api/topics/.
export type TopicPage = {
  date: string | null;
  count: number;
  page: number;
  pages: number;
  sources: { source: string | null; count: number }[];
  results: TopicRow[];
};

// The filters that live in the URL (?date=&source=&q=); page is separate.
export type TopicQuery = { date?: string; source?: string; q?: string };

type CollectResult = Record<string, { added: number; skipped: number } | { error: string }>;

const POLL_MS = 5000;
const SEARCH_DELAY_MS = 400;
const PAGE_SIZE = 30; // matches TOPICS_PAGE_SIZE in the Django view

// Special ?date= value for "every day at once".
export const ALL_DAYS = "all";

async function errorMessage(res: Response) {
  try {
    const data = await res.json();
    return data.error ?? data.detail ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function formatDay(iso: string) {
  // Parse as a local date; new Date("2026-10-29") would be UTC midnight and
  // can show as the previous day west of Greenwich.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isWaiting(t: TopicRow) {
  return t.ai_status === "pending" || t.ai_status === "running";
}

// Page numbers to show: always first/last, a window around the current page,
// and null for each gap ("…").
function pageList(page: number, pages: number): (number | null)[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const list: (number | null)[] = [];
  for (let p = 1; p <= pages; p++) {
    if (wanted.has(p)) list.push(p);
    else if (list[list.length - 1] !== null) list.push(null);
  }
  return list;
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const button =
    "min-w-9 rounded-md border px-3 py-1.5 text-sm disabled:opacity-30";
  return (
    <nav className="mt-6 flex flex-wrap items-center justify-center gap-1" aria-label="Pages">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className={`${button} border-foreground/15 text-foreground/70 hover:text-foreground`}
      >
        ← Prev
      </button>
      {pageList(page, pages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} className="px-1 text-foreground/40">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={`${button} ${
              p === page
                ? "border-accent bg-accent/15 text-accent"
                : "border-foreground/15 text-foreground/70 hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        className={`${button} border-foreground/15 text-foreground/70 hover:text-foreground`}
      >
        Next →
      </button>
    </nav>
  );
}

function TopicItem({
  topic,
  canEdit,
  showDate,
  onChange,
  onDelete,
}: {
  topic: TopicRow;
  canEdit: boolean;
  showDate: boolean;
  onChange: (t: TopicRow) => void;
  onDelete: () => void;
}) {
  const [showQuestion, setShowQuestion] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const waiting = isWaiting(topic);

  // While Claude works on the host, poll until the answer lands.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/topics/${topic.tp_id}/`);
      if (res.ok) onChange(await res.json());
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, topic.tp_id, onChange]);

  async function ask() {
    setError(null);
    try {
      const res = await fetch(`/api/topics/${topic.tp_id}/suggest/`, {
        method: "POST",
        headers: csrfHeaders(),
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      onChange(await res.json());
      setShowQuestion(false);
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <li className="py-4">
      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
        {topic.source}
      </span>
      {showDate && topic.created_date && (
        <span className="ml-2 text-xs text-foreground/50">{formatDay(topic.created_date)}</span>
      )}
      <p className="mt-1 font-medium">
        {topic.url ? (
          <a href={topic.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
            {topic.content}
          </a>
        ) : (
          topic.content
        )}
      </p>

      {canEdit && (
        <>
          {topic.ai_suggestion && !waiting && (
            <div
              className={`mt-2 rounded-md border-l-2 p-3 text-sm whitespace-pre-wrap ${
                topic.ai_status === "error"
                  ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : "border-accent bg-foreground/5"
              }`}
            >
              {topic.ai_question && (
                <p className="mb-1 text-xs text-foreground/50">You asked: {topic.ai_question}</p>
              )}
              {topic.ai_suggestion}
            </div>
          )}
          {waiting && (
            <p className="mt-2 animate-pulse text-sm text-foreground/60">
              {topic.ai_status === "running"
                ? "Claude is researching this topic…"
                : "Queued for Claude - usually answered within 1-2 minutes…"}
            </p>
          )}

          {showQuestion && (
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              placeholder="Optional: ask something specific, e.g. “Could this be a YouTube short?”"
              className="mt-2 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          )}
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-2 flex gap-4 text-sm">
            <button type="button" onClick={ask} disabled={waiting} className="text-accent hover:underline disabled:opacity-50">
              {topic.ai_suggestion || topic.ai_status ? "Ask again" : "Ask AI"}
            </button>
            {!showQuestion && !waiting && (
              <button type="button" onClick={() => setShowQuestion(true)} className="text-foreground/60 hover:text-foreground">
                Add a question
              </button>
            )}
            <button type="button" onClick={onDelete} className="ml-auto text-foreground/40 hover:text-red-600">
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  );
}

export default function TopicsBoard({
  dates,
  data,
  query,
  canEdit,
}: {
  dates: TopicDate[];
  data: TopicPage;
  query: TopicQuery;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query.q ?? "");
  // The list comes from the server (props); keep only local edits on top -
  // AI answers polled in, and deletes - so a router.refresh() just works.
  const [updated, setUpdated] = useState<Record<number, TopicRow>>({});
  const [deleted, setDeleted] = useState<Set<number>>(new Set());
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<CollectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topics = data.results
    .filter((t) => !deleted.has(t.tp_id))
    .map((t) => updated[t.tp_id] ?? t);

  // Stable identity, so a TopicItem's polling timer isn't reset on every render.
  const updateTopic = useCallback(
    (t: TopicRow) => setUpdated((prev) => ({ ...prev, [t.tp_id]: t })),
    [],
  );

  const selectedDate = data.date;
  const allDays = selectedDate === ALL_DAYS;

  // Changing a filter goes back to page 1; only explicit paging sets page.
  const navigate = useCallback(
    (changes: TopicQuery & { page?: number }, replace = false) => {
      const next = { ...query, ...changes };
      const params = new URLSearchParams();
      for (const key of ["date", "source", "q"] as const) {
        if (next[key]) params.set(key, next[key]!);
      }
      if (changes.page && changes.page > 1) params.set("page", String(changes.page));
      const qs = params.toString();
      const url = qs ? `/topics?${qs}` : "/topics";
      if (replace) router.replace(url);
      else router.push(url);
    },
    [query, router],
  );

  // Search as you type, after a short pause (replace: no history entry per keystroke).
  useEffect(() => {
    if (search === (query.q ?? "")) return;
    const timer = setTimeout(() => navigate({ q: search }, true), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, query.q, navigate]);

  // dates is newest first, so "older" is the next index.
  const index = dates.findIndex((d) => d.date === selectedDate);
  const newer = index > 0 ? dates[index - 1].date : null;
  const older = index >= 0 && index < dates.length - 1 ? dates[index + 1].date : null;
  const totalCount = dates.reduce((n, d) => n + d.count, 0);
  const sourceTotal = data.sources.reduce((n, s) => n + s.count, 0);

  async function collect() {
    setCollecting(true);
    setError(null);
    setCollectResult(null);
    try {
      const res = await fetch("/api/topics/collect/", { method: "POST", headers: csrfHeaders() });
      if (!res.ok) throw new Error(await errorMessage(res));
      setCollectResult(await res.json());
      // New items are dated today: show the newest day (or keep "All days").
      if (allDays) navigate({ date: ALL_DAYS, source: "", q: "" });
      else navigate({ date: "", source: "", q: "" });
      setSearch("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCollecting(false);
    }
  }

  async function remove(id: number) {
    const res = await fetch(`/api/topics/${id}/`, { method: "DELETE", headers: csrfHeaders() });
    if (!res.ok) return setError(await errorMessage(res));
    setDeleted((prev) => new Set(prev).add(id));
    router.refresh(); // update counts and refill the page
  }

  const added = collectResult
    ? Object.values(collectResult).reduce((n, r) => n + ("added" in r ? r.added : 0), 0)
    : 0;
  const failed = collectResult
    ? Object.entries(collectResult).filter(([, r]) => "error" in r).map(([name]) => name)
    : [];

  const first = (data.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(data.page * PAGE_SIZE, data.count);
  const navButton =
    "rounded-md border border-foreground/15 px-3 py-2 text-sm text-foreground/70 hover:text-foreground disabled:opacity-30";
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 ${
      active
        ? "border-accent bg-accent/15 text-accent"
        : "border-foreground/15 text-foreground/70 hover:text-foreground"
    }`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => older && navigate({ date: older })} disabled={!older} className={navButton} aria-label="Previous day">
          ←
        </button>
        <select
          value={selectedDate ?? ""}
          onChange={(e) => navigate({ date: e.target.value })}
          disabled={dates.length === 0}
          aria-label="Choose a day"
          className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {dates.length === 0 ? (
            <option value="">No topics yet</option>
          ) : (
            <option value={ALL_DAYS}>All days ({totalCount})</option>
          )}
          {dates.map((d) => (
            <option key={d.date} value={d.date}>
              {formatDay(d.date)} ({d.count})
            </option>
          ))}
        </select>
        <button type="button" onClick={() => newer && navigate({ date: newer })} disabled={!newer} className={navButton} aria-label="Next day">
          →
        </button>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={allDays ? "Search all days" : "Search this day"}
          className="min-w-0 flex-1 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none sm:max-w-xs"
        />
        {canEdit && (
          <button
            type="button"
            onClick={collect}
            disabled={collecting}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium whitespace-nowrap text-background hover:opacity-80 disabled:opacity-40 sm:ml-auto"
          >
            {collecting ? "Collecting…" : "Collect now"}
          </button>
        )}
      </div>

      {collectResult && (
        <p className="mb-4 text-sm text-foreground/70">
          Added {added} new topic{added === 1 ? "" : "s"}.
          {failed.length > 0 && ` Couldn't reach: ${failed.join(", ")}.`}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mb-2 flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={() => navigate({ source: "" })} className={chip(!query.source)}>
          All ({sourceTotal})
        </button>
        {data.sources.map((s) => (
          <button
            key={s.source ?? "other"}
            type="button"
            onClick={() => navigate({ source: s.source ?? "" })}
            className={chip(query.source === s.source)}
          >
            {s.source ?? "other"} ({s.count})
          </button>
        ))}
      </div>

      {data.count > 0 && (
        <p className="mt-3 text-xs text-foreground/50">
          Showing {first}-{last} of {data.count}
        </p>
      )}

      {topics.length === 0 ? (
        <p className="py-8 text-sm text-foreground/60">
          {data.count === 0 && !query.source && !query.q
            ? allDays
              ? "Nothing collected yet."
              : "Nothing collected for this day yet."
            : "No topics match."}
        </p>
      ) : (
        <ul className="divide-y divide-foreground/10">
          {topics.map((t) => (
            <TopicItem
              key={t.tp_id}
              topic={t}
              canEdit={canEdit}
              showDate={allDays}
              onChange={updateTopic}
              onDelete={() => remove(t.tp_id)}
            />
          ))}
        </ul>
      )}

      <Pagination page={data.page} pages={data.pages} onPage={(page) => navigate({ page })} />
    </div>
  );
}
