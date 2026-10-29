import { getWithSession } from "../lib/backend";
import TopicsBoard, { type TopicRow } from "./TopicsBoard";

export default async function Topics() {
  let rows: TopicRow[] = [];
  let error: string | null = null;
  try {
    rows = await getWithSession<TopicRow[]>("/api/topics/");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="mb-1 text-3xl font-extrabold tracking-tight">Hot topics</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Trending items from Hacker News, Reddit, Google Trends, Bluesky, Mastodon, GitHub,
        dev.to, Lobsters and Baidu. Ask AI for content ideas on any of them.
      </p>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Failed to load: {error}
        </p>
      ) : (
        <TopicsBoard initialTopics={rows} />
      )}
    </main>
  );
}
