// Django sets the csrftoken cookie at login; logged-in POST/DELETE calls
// must echo it back in the X-CSRFToken header or DRF rejects them with 403.
export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function csrfHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-CSRFToken": getCookie("csrftoken") ?? "",
  };
}
