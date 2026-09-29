import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import NavLinks from "./NavLinks";
import logo from "../../public/Logo.png";

type SocialLinkData = { id: number; platform: string; label: string; url: string };

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

async function getSocialLinks(): Promise<SocialLinkData[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/portfolio/social-links/`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function NavBar() {
  const [username, socialLinks] = await Promise.all([getUsername(), getSocialLinks()]);

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-80">
          <Image src={logo} alt="Zhipeng Wu" className="h-9 w-auto" priority />
        </Link>

        <NavLinks username={username} socialLinks={socialLinks} />
      </nav>
    </header>
  );
}
