import { headers } from "next/headers";

// Backend base URL for server-side fetches:
//   - local dev:  unset -> http://localhost:8000 (Django runserver)
//   - Docker:     BACKEND_URL=http://backend:8000 (set in docker-compose.yml)
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

// GET a login-only Django endpoint from a server component. Server-side
// fetches don't carry the browser's cookies automatically, so forward the
// session cookie by hand (same trick NavBar uses for /api/whoami/).
export async function getWithSession<T>(path: string): Promise<T> {
  const cookie = (await headers()).get("cookie") ?? "";
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Backend responded ${res.status}`);
  return res.json();
}
