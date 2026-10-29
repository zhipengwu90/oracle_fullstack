import { getWithSession } from "../lib/backend";
import TopicsBoard, { type TopicDate, type TopicPage, type TopicQuery } from "./TopicsBoard";

export default async function Trending({
  searchParams,
}: {
  searchParams: Promise<TopicQuery & { page?: string }>;
}) {
  const { date, source, q, page } = await searchParams;
  const query: TopicQuery = { date, source, q };
  let dates: TopicDate[] = [];
  let data: TopicPage | null = null;
  let loggedIn = false;
  let error: string | null = null;
  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, page })) {
      if (value) params.set(key, value);
    }
    [{ authenticated: loggedIn }, dates, data] = await Promise.all([
      getWithSession<{ authenticated: boolean }>("/api/whoami/"),
      getWithSession<TopicDate[]>("/api/topics/dates/"),
      getWithSession<TopicPage>(`/api/topics/?${params}`),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

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

      {error || !data ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Failed to load: {error}
        </p>
      ) : (
        <TopicsBoard dates={dates} data={data} query={query} canEdit={loggedIn} />
      )}
    </main>
  );
}
