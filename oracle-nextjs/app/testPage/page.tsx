type TestRow = { id: number; data: string | null };

// Backend base URL for server-side fetches:
//   - local dev:  unset -> http://localhost:8000 (Django runserver)
//   - Docker:     BACKEND_URL=http://backend:8000 (set in docker-compose.yml)
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function getRows(): Promise<TestRow[]> {
  const res = await fetch(`${BACKEND_URL}/api/tests/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Backend responded ${res.status}`);
  return res.json();
}

export default async function Home() {
  let rows: TestRow[] = [];
  let error: string | null = null;
  try {
    rows = await getRows();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div>
        this is the test page for the oracle-nextjs project. it fetches data from the django backend and displays it in a table.
      </div>
      <h1 className="mb-1 text-2xl font-semibold">my_bank.test</h1>
      <p className="mb-6 text-sm text-gray-500">
        Data read from the <code>test</code> table in the <code>my_bank</code>{" "}
        schema, via the Django API.
      </p>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Failed to load: {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No rows in my_bank.test yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300 text-left">
              <th className="py-2 pr-4 font-medium">id</th>
              <th className="py-2 font-medium">data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-200">
                <td className="py-2 pr-4 tabular-nums">{row.id}</td>
                <td className="py-2">{row.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
