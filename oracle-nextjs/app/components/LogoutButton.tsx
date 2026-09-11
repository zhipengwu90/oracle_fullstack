"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      // csrftoken cookie is set by Django whenever a CSRF-protected form
      // (e.g. the login page) has been rendered in this session.
      await fetch("/api/logout/", {
        method: "POST",
        headers: { "X-CSRFToken": getCookie("csrftoken") ?? "" },
      });
      router.refresh(); // re-runs NavBar (server component) with fresh auth state
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {loading ? "Logging out…" : "Log out"}
    </button>
  );
}
