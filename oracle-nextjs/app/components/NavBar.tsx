import Link from "next/link";

export default function NavBar() {
  return (
    <header className="border-b border-gray-200">
      <nav className="mx-auto flex max-w-4xl items-center justify-between p-4">
        <Link href="/" className="text-lg font-semibold">
          Wu App
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <Link href="/testPage" className="text-gray-600 hover:text-gray-900">
            Test Page
          </Link>
          {/* Uses Django's existing session-auth login page (already working,
              see /admin/). Proxied same-origin: nginx in production,
              next.config.ts rewrites() in local dev. */}
          <a
            href="/admin/login/?next=/"
            className="rounded-md bg-gray-900 px-4 py-1.5 font-medium text-white hover:bg-gray-700"
          >
            Log in
          </a>
        </div>
      </nav>
    </header>
  );
}
