import Link from "next/link";
import { headers } from "next/headers";
import LogoutButton from "./LogoutButton";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function getUsername(): Promise<string | null> {
  const cookie = (await headers()).get("cookie") ?? "";
  try {
    const res = await fetch(`${BACKEND_URL}/api/whoami/`, {
      headers: { cookie },
      cache: "no-store",
    });
    const data = await res.json();
    return data.authenticated ? (data.username as string) : null;
  } catch {
    return null;
  }
}

export default async function NavBar() {
  const username = await getUsername();

  return (
    <header className="border-b border-gray-200">
      <nav className="mx-auto flex max-w-4xl items-center justify-between p-4">
        <Link href="/" className="text-lg font-semibold">
          Wu App
        </Link>

        <div className="flex items-center gap-6 text-sm">
          {username ? (
            <>
              <Link
                href="/calculator"
                className="text-gray-600 hover:text-gray-900"
              >
                Calculator
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-gray-700">Hi, {username}</span>
                <LogoutButton />
              </div>
            </>
          ) : (
            // Django's existing session-auth login page, proxied same-origin:
            // nginx in production, next.config.ts rewrites() in local dev.
            <a
              href="/admin/login/?next=/"
              className="rounded-md bg-gray-900 px-4 py-1.5 font-medium text-white hover:bg-gray-700"
            >
              Log in
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}
