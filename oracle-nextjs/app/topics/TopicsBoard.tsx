"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type CollectResult = Record<string, { added: number; skipped: number } | { error: string }>;

const POLL_MS = 5000;

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

function TopicItem({
  topic,
  canEdit,
  onChange,
  onDelete,
}: {
  topic: TopicRow;
  canEdit: boolean;
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
  selectedDate,
  initialTopics,
  canEdit,
}: {
  dates: TopicDate[];
  selectedDate: string | null;
  initialTopics: TopicRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [topics, setTopics] = useState(initialTopics);
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<CollectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable identity, so a TopicItem's polling timer isn't reset on every render.
  const updateTopic = useCallback(
    (updated: TopicRow) =>
      setTopics((prev) => prev.map((p) => (p.tp_id === updated.tp_id ? updated : p))),
    [],
  );

  const sources = useMemo(
    () => [...new Set(topics.map((t) => t.source ?? "other"))].sort(),
    [topics],
  );
  const visible = topics.filter(
    (t) =>
      (source === "all" || (t.source ?? "other") === source) &&
      (t.content ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  // dates is newest first, so "older" is the next index.
  const index = dates.findIndex((d) => d.date === selectedDate);
  const newer = index > 0 ? dates[index - 1].date : null;
  const older = index >= 0 && index < dates.length - 1 ? dates[index + 1].date : null;
  const goTo = (day: string) => router.push(`/topics?date=${day}`);

  async function collect() {
    setCollecting(true);
    setError(null);
    setCollectResult(null);
    try {
      const res = await fetch("/api/topics/collect/", { method: "POST", headers: csrfHeaders() });
      if (!res.ok) throw new Error(await errorMessage(res));
      setCollectResult(await res.json());
      // /api/topics/ with no date returns the newest day, where new items land.
      const latest = await fetch("/api/topics/");
      const rows: TopicRow[] = latest.ok ? await latest.json() : [];
      if (rows[0]?.created_date === selectedDate) setTopics(rows);
      else router.push("/topics"); // a new day appeared: switch to it
      router.refresh(); // update the day list and counts
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCollecting(false);
    }
  }

  async function remove(id: number) {
    const res = await fetch(`/api/topics/${id}/`, { method: "DELETE", headers: csrfHeaders() });
    if (res.ok) setTopics((prev) => prev.filter((t) => t.tp_id !== id));
    else setError(await errorMessage(res));
  }

  const added = collectResult
    ? Object.values(collectResult).reduce((n, r) => n + ("added" in r ? r.added : 0), 0)
    : 0;
  const failed = collectResult
    ? Object.entries(collectResult).filter(([, r]) => "error" in r).map(([name]) => name)
    : [];

  const navButton =
    "rounded-md border border-foreground/15 px-3 py-2 text-sm text-foreground/70 hover:text-foreground disabled:opacity-30";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => older && goTo(older)} disabled={!older} className={navButton} aria-label="Previous day">
          ←
        </button>
        <select
          value={selectedDate ?? ""}
          onChange={(e) => goTo(e.target.value)}
          disabled={dates.length === 0}
          aria-label="Choose a day"
          className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {dates.length === 0 && <option value="">No topics yet</option>}
          {dates.map((d) => (
            <option key={d.date} value={d.date}>
              {formatDay(d.date)} ({d.count})
            </option>
          ))}
        </select>
        <button type="button" onClick={() => newer && goTo(newer)} disabled={!newer} className={navButton} aria-label="Next day">
          →
        </button>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this day"
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
        {["all", ...sources].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            className={`rounded-full border px-3 py-1 ${
              source === s
                ? "border-accent bg-accent/15 text-accent"
                : "border-foreground/15 text-foreground/70 hover:text-foreground"
            }`}
          >
            {s === "all" ? `All (${topics.length})` : s}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-sm text-foreground/60">
          {topics.length === 0 ? "Nothing collected for this day yet." : "No topics match."}
        </p>
      ) : (
        <ul className="divide-y divide-foreground/10">
          {visible.map((t) => (
            <TopicItem
              key={t.tp_id}
              topic={t}
              canEdit={canEdit}
              onChange={updateTopic}
              onDelete={() => remove(t.tp_id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
