import type { Metadata, Viewport } from "next";
import { THEME_SCRIPT } from "@/lib/theme";
import { AppFrame } from "./app-frame";
import "./globals.css";

export const metadata: Metadata = {
  title: "Card Pro Max",
  description: "Credit card promos worth chasing: what's on for our cards, what we've joined, and the rewards still to come.",
  icons: { icon: "/icons/logo.svg" },
};

// The browser's bar matches the page: --page in light and dark (app/globals.css).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4ece0" },
    { media: "(prefers-color-scheme: dark)", color: "#051214" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The saved Light or Dark (Settings) goes on <html> before the first paint, so the DOM differs from the server's.
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body><AppFrame>{children}</AppFrame></body>
    </html>
  );
}
