import { NextRequest, NextResponse } from "next/server";

// Add/remove page paths here to control what requires login.
// Everything NOT listed here stays public.
const PROTECTED_PATHS = ["/calculator"];

// Keep this in sync with PROTECTED_PATHS above (Next.js needs the matcher
// to be statically written out, it can't be built from an array at runtime).
export const config = {
  matcher: ["/calculator/:path*"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isProtected) return NextResponse.next();

  const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

  try {
    const res = await fetch(`${backend}/api/whoami/`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    const data = await res.json();
    if (data.authenticated) return NextResponse.next();
  } catch {
    // Backend unreachable -> fail closed (redirect to login) below.
  }

  const loginUrl = new URL("/admin/login/", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}
