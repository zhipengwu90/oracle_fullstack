"use client";

import { useMemo, useState } from "react";
import { csrfHeaders } from "../lib/csrf";

export type TopicRow = {
  tp_id: number;
  source: string | null;
  content: string | null;
  url: string | null;
  created_date: string | null;
  ai_suggestion: string | null;
};

type CollectResult = Record<string, { added: number; skipped: number } | { error: string }>;

async function errorMessage(res: Response) {
  try {
    const data = await res.json();
    return data.error ?? data.detail ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function TopicItem({
  topic,
  onChange,
  onDelete,
}: {
  topic: TopicRow;
  onChange: (t: TopicRow) => void;
  onDelete: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setAsking(true);
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
    } finally {
      setAsking(false);
    }
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
          {topic.source}
        </span>
        <span className="text-xs text-foreground/50">{topic.created_date}</span>
      </div>
      <p className="mt-1 font-medium">
        {topic.url ? (
          <a href={topic.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
            {topic.content}
          </a>
        ) : (
          topic.content
        )}
      </p>

      {topic.ai_suggestion && (
        <p className="mt-2 rounded-md border-l-2 border-accent bg-foreground/5 p-3 text-sm whitespace-pre-wrap">
          {topic.ai_suggestion}
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
        <button type="button" onClick={ask} disabled={asking} className="text-accent hover:underline disabled:opacity-50">
          {asking ? "Asking AI…" : topic.ai_suggestion ? "Ask again" : "Ask AI"}
        </button>
        {!showQuestion && !asking && (
          <button type="button" onClick={() => setShowQuestion(true)} className="text-foreground/60 hover:text-foreground">
            Add a question
          </button>
        )}
        <button type="button" onClick={onDelete} className="ml-auto text-foreground/40 hover:text-red-600">
          Delete
        </button>
      </div>
    </li>
  );
}

export default function TopicsBoard({ initialTopics }: { initialTopics: TopicRow[] }) {
  const [topics, setTopics] = useState(initialTopics);
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<CollectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sources = useMemo(
    () => [...new Set(topics.map((t) => t.source ?? "other"))].sort(),
    [topics],
  );
  const visible = topics.filter(
    (t) =>
      (source === "all" || (t.source ?? "other") === source) &&
      (t.content ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  async function collect() {
    setCollecting(true);
    setError(null);
    setCollectResult(null);
    try {
      const res = await fetch("/api/topics/collect/", { method: "POST", headers: csrfHeaders() });
      if (!res.ok) throw new Error(await errorMessage(res));
      setCollectResult(await res.json());
      const list = await fetch("/api/topics/");
      if (list.ok) setTopics(await list.json());
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

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={collect}
          disabled={collecting}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium whitespace-nowrap text-background hover:opacity-80 disabled:opacity-40"
        >
          {collecting ? "Collecting… (up to 30s)" : "Collect hot topics now"}
        </button>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search topics"
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none sm:max-w-xs"
        />
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
          {topics.length === 0 ? "No topics yet - click “Collect hot topics now”." : "No topics match."}
        </p>
      ) : (
        <ul className="divide-y divide-foreground/10">
          {visible.map((t) => (
            <TopicItem
              key={t.tp_id}
              topic={t}
              onChange={(updated) =>
                setTopics((prev) => prev.map((p) => (p.tp_id === updated.tp_id ? updated : p)))
              }
              onDelete={() => remove(t.tp_id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
