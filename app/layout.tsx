import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { ThemeScript } from "@/components/ThemeScript";
import { getUser } from "@/lib/supabase/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexplay — Play free games online",
  description:
    "Free browser games, no downloads required. Play classics solo, climb the leaderboards, or invite friends to play live.",
  icons: {
    icon: [{ url: "/icon.webp", type: "image/webp" }],
    apple: "/nexplay-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUser();
  const isAuthenticated = Boolean(user);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <ConfirmProvider>
          <Header />
          <div className="flex-1 flex">
            <Sidebar isAuthenticated={isAuthenticated} />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
          <footer className="mt-12 border-t border-[var(--border)] bg-[var(--surface)]">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-8">
                <div className="col-span-2 sm:col-span-4 lg:col-span-4">
                  <Image
                    src="/nexplay-logo.png"
                    alt="Nexplay"
                    width={2000}
                    height={1000}
                    className="h-14 w-auto mb-3"
                  />
                  <p className="text-xs text-[var(--muted)] leading-relaxed max-w-xs">
                    Free browser games — no downloads, sign in to save scores or play live with friends.
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <a
                      href="https://github.com/techyMk/nexplay"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="GitHub"
                      title="GitHub"
                      className="w-9 h-9 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden>
                        <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18A11 11 0 0 1 12 6.85c.99 0 1.99.13 2.92.39 2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.18c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
                      </svg>
                    </a>
                    <a
                      href="/friends"
                      aria-label="Friends"
                      title="Friends"
                      className="w-9 h-9 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </a>
                    <a
                      href="/multiplayer"
                      aria-label="Multiplayer"
                      title="Multiplayer"
                      className="w-9 h-9 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                        <rect x="2" y="6" width="20" height="12" rx="2" />
                        <path d="M6 12h4M8 10v4" />
                        <circle cx="15" cy="10" r="1" />
                        <circle cx="18" cy="13" r="1" />
                      </svg>
                    </a>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] mb-3 font-bold">
                    Play
                  </div>
                  <ul className="space-y-2 text-sm">
                    <li><a href="/" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Home</a></li>
                    <li><a href="/multiplayer" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Multiplayer</a></li>
                    <li><a href="/friends" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Friends</a></li>
                    <li><a href="/guide" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">How to play</a></li>
                  </ul>
                </div>
                <div className="lg:col-span-3">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] mb-3 font-bold">
                    Discover
                  </div>
                  <ul className="space-y-2 text-sm">
                    <li><a href="/category/puzzle" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Puzzle</a></li>
                    <li><a href="/category/action" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Action</a></li>
                    <li><a href="/category/arcade" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Arcade</a></li>
                    <li><a href="/category/adventure" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Adventure</a></li>
                  </ul>
                </div>
                <div className="lg:col-span-3">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] mb-3 font-bold">
                    Account
                  </div>
                  <ul className="space-y-2 text-sm">
                    <li><a href="/login" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Log in</a></li>
                    <li><a href="/profile" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Profile</a></li>
                    <li><a href="/settings" className="hover:text-[var(--foreground)] text-[var(--muted)] transition-colors">Settings</a></li>
                  </ul>
                </div>
              </div>
              <div className="border-t border-[var(--border)]">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--muted)]">
                  <p className="text-center sm:text-left">© {new Date().getFullYear()} Nexplay · Play. Repeat.</p>
                  <a
                    href="https://techymk.vercel.app/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-medium hover:text-[var(--foreground)] transition-colors"
                  >
                    Designed &amp; developed by
                    <span className="inline-flex items-center gap-1.5 font-bold text-[var(--foreground)]">
                      <Image
                        src="/icon.webp"
                        alt=""
                        width={20}
                        height={20}
                        className="rounded-full"
                      />
                      techyMk
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3 h-3 opacity-60"
                      aria-hidden
                    >
                      <path d="M7 17L17 7M7 7h10v10" />
                    </svg>
                  </a>
                </div>
              </div>
          </footer>
        </ConfirmProvider>
      </body>
    </html>
  );
}
