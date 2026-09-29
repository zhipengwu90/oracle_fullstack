type TopicRow = {
  tp_id: number;
  source: string | null;
  content: string | null;
  created_date: string | null;
  ai_suggestion: string | null;
};

// Backend base URL for server-side fetches:
//   - local dev:  unset -> http://localhost:8000 (Django runserver)
//   - Docker:     BACKEND_URL=http://backend:8000 (set in docker-compose.yml)
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function getRows(): Promise<TopicRow[]> {
  const res = await fetch(`${BACKEND_URL}/api/topics/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Backend responded ${res.status}`);
  return res.json();
}

export default async function Topics() {
  let rows: TopicRow[] = [];
  let error: string | null = null;
  try {
    rows = await getRows();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">Topics</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Data read from the <code>topics</code> table in the{" "}
        <code>myapp_v1</code> schema, via the Django API.
      </p>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Failed to load: {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No rows in myapp_v1.topics yet.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300 text-left dark:border-gray-700">
              <th className="py-2 pr-4 font-medium">Source</th>
              <th className="py-2 pr-4 font-medium">Content</th>
              <th className="py-2 pr-4 font-medium">Created</th>
              <th className="py-2 font-medium">AI Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.tp_id}
                className="border-b border-gray-200 align-top dark:border-gray-800"
              >
                <td className="py-2 pr-4">{row.source}</td>
                <td className="py-2 pr-4">{row.content}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {row.created_date}
                </td>
                <td className="py-2">{row.ai_suggestion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
