"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SocialLinks from "./portfolio/SocialLinks";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";

type SocialLinkData = { id: number; platform: string; label: string; url: string };

// Active page keeps its underline on permanently instead of only on hover.
function navLinkClass(isActive: boolean) {
  return `relative transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:bg-accent after:transition-all after:duration-300 ${
    isActive
      ? "text-foreground after:w-full"
      : "text-foreground/70 hover:text-foreground after:w-0 hover:after:w-full"
  }`;
}

function PublicLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <>
      <Link href="/" onClick={onNavigate} className={navLinkClass(pathname === "/")}>
        Home
      </Link>
      <Link
        href="/projects"
        onClick={onNavigate}
        className={navLinkClass(pathname === "/projects")}
      >
        Projects
      </Link>
      <Link href="/about" onClick={onNavigate} className={navLinkClass(pathname === "/about")}>
        About
      </Link>
    </>
  );
}

function MenuLinks({
  username,
  pathname,
  onNavigate,
}: {
  username: string | null;
  pathname: string;
  onNavigate: () => void;
}) {
  if (!username) return null;
  return (
    <>
      <Link
        href="/calculator"
        onClick={onNavigate}
        className={navLinkClass(pathname === "/calculator")}
      >
        Calculator
      </Link>
      <Link href="/topics" onClick={onNavigate} className={navLinkClass(pathname === "/topics")}>
        Topics
      </Link>
      {/* Django Admin isn't a Next.js route - a plain <a> forces a full
          navigation instead of Next's client-side router, which has no
          idea this path exists. Never "active" from in here since leaving
          for /admin/ unmounts this component entirely. */}
      <a href="/admin/" onClick={onNavigate} className={navLinkClass(false)}>
        Admin
      </a>
    </>
  );
}

export default function NavLinks({
  username,
  socialLinks,
}: {
  username: string | null;
  socialLinks: SocialLinkData[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <div className="hidden items-center gap-7 text-sm font-medium md:flex">
        <PublicLinks pathname={pathname} onNavigate={() => {}} />
        <MenuLinks username={username} pathname={pathname} onNavigate={() => {}} />
        {username && <UserMenu username={username} />}
        <span className="h-4 w-px bg-foreground/15" aria-hidden="true" />
        <SocialLinks links={socialLinks} />
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-3 text-sm md:hidden">
        {username && <UserMenu username={username} />}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          ☰
        </button>
      </div>

      <div
        className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute top-0 right-0 flex h-full w-64 flex-col items-start gap-4 border-l border-foreground/10 bg-background p-6 shadow-2xl transition-transform ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="rounded-md p-2 text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col items-start gap-4 text-base font-medium">
            <PublicLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <MenuLinks username={username} pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
          <SocialLinks links={socialLinks} className="mt-auto" />
        </div>
      </div>
    </>
  );
}
