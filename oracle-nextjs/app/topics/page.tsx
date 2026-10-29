import { getWithSession } from "../lib/backend";
import TopicsBoard, { type TopicDate, type TopicRow } from "./TopicsBoard";

export default async function Trending({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  let dates: TopicDate[] = [];
  let rows: TopicRow[] = [];
  let loggedIn = false;
  let error: string | null = null;
  try {
    const [whoami, dateList] = await Promise.all([
      getWithSession<{ authenticated: boolean }>("/api/whoami/"),
      getWithSession<TopicDate[]>("/api/topics/dates/"),
    ]);
    loggedIn = whoami.authenticated;
    dates = dateList;
    const selected = date ?? dates[0]?.date;
    if (selected) {
      rows = await getWithSession<TopicRow[]>(`/api/topics/?date=${encodeURIComponent(selected)}`);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const selectedDate = date ?? dates[0]?.date ?? null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold tracking-widest text-accent uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        Updated every 6 hours
      </p>
      <h1 className="mb-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Trending</h1>
      <p className="mb-8 max-w-2xl text-sm text-foreground/70">
        What people are talking about right now. Collected automatically from Hacker News,
        Reddit, Google Trends, Bluesky, Mastodon, GitHub, dev.to, Lobsters and Baidu. Pick a
        day to see what was hot then, and click any headline to read the original.
        {loggedIn && " You can also ask AI for content ideas on any topic."}
      </p>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Failed to load: {error}
        </p>
      ) : (
        <TopicsBoard
          // Remount on day change so local state starts from that day's data.
          key={selectedDate ?? "none"}
          dates={dates}
          selectedDate={selectedDate}
          initialTopics={rows}
          canEdit={loggedIn}
        />
      )}
    </main>
  );
}
