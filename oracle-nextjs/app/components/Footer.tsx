import Link from "next/link";
import { headers } from "next/headers";

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

export default async function Footer() {
  const username = await getUsername();

  return (
    <footer className="border-t border-foreground/10">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-6 py-8 text-sm text-foreground/60">
        <span>
          &copy; {new Date().getFullYear()} Zhipeng Wu. All rights reserved.
          {!username && (
            <>
              {" "}
              ·{" "}
              <Link href="/login" className="hover:text-accent hover:underline">
                Log in
              </Link>
            </>
          )}
        </span>
      </div>
    </footer>
  );
}
