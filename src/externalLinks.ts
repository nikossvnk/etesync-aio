// SPDX-FileCopyrightText: © 2026 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import { Platform } from "react-native";

// When the installed app's window is in a browser profile of its own, the local server (desktop/serve.py,
// with --open-links) opens links to other sites in the computer's default browser, where the user is
// logged in to them, rather than in the window's profile. This sends it the links that the app opens
// (with Linking.openURL, which is window.open on the web) and the ones that are clicked (links of
// other sites, e.g. the bookmarks' and the ones in notes).

// The link as the server opens it, if it's one to another site (or an email or phone link)
export function outsideLink(url: string | URL | undefined, base: string): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  try {
    const parsed = new URL(url.toString(), base);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return (parsed.origin !== new URL(base).origin) ? parsed.toString() : undefined;
    }
    return (["mailto:", "tel:"].includes(parsed.protocol)) ? parsed.toString() : undefined;
  } catch (e) {
    return undefined;
  }
}

function openWithServer(url: string) {
  fetch("/open-link", {
    method: "POST",
    // (which a page of another site can't send without asking first, so only the app can use it)
    headers: { "X-EteSync-Request": "open", "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => undefined);
}

export async function setupExternalLinks() {
  if ((Platform.OS !== "web") || (typeof window === "undefined")) {
    return;
  }
  try {
    const response = await fetch("/open-link", { headers: { "X-EteSync-Request": "open" } });
    if (!response.ok || ((await response.json()).enabled !== true)) {
      return;
    }
  } catch (e) {
    // (served without it, e.g. by npx expo start)
    return;
  }

  const windowOpen = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string) => {
    const outside = outsideLink(url, window.location.href);
    if (outside) {
      openWithServer(outside);
      return null;
    }
    return windowOpen(url, target, features);
  };

  // Clicked links, also with the middle button (which opens them in a tab)
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || ((e.type === "auxclick") && (e.button !== 1))) {
      return;
    }
    const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    const outside = (link && !link.hasAttribute("download")) ? outsideLink(link.href, window.location.href) : undefined;
    if (outside) {
      e.preventDefault();
      openWithServer(outside);
    }
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);
}
