import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <div className="flex-1 flex">
          <Sidebar />
          <div className="flex-1 min-w-0">
            <main>{children}</main>
            <footer className="mt-12 border-t border-[var(--border)] bg-[var(--surface)]">
              <div className="px-4 sm:px-6 lg:px-8 py-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Image
                      src="/nexplay-icon.png"
                      alt="Nexplay"
                      width={2000}
                      height={2000}
                      className="w-8 h-8 rounded-md"
                    />
                    <span className="font-black text-base">
                      Nex<span className="text-gradient">play</span>
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Free browser games — no downloads, sign in to save scores or play live with friends.
                  </p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] mb-2 font-bold">
                    Play
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    <li><a href="/" className="hover:text-[var(--foreground)] text-[var(--muted)]">Home</a></li>
                    <li><a href="/multiplayer" className="hover:text-[var(--foreground)] text-[var(--muted)]">Multiplayer</a></li>
                    <li><a href="/category/puzzle" className="hover:text-[var(--foreground)] text-[var(--muted)]">Puzzle</a></li>
                    <li><a href="/category/action" className="hover:text-[var(--foreground)] text-[var(--muted)]">Action</a></li>
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] mb-2 font-bold">
                    Account
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    <li><a href="/login" className="hover:text-[var(--foreground)] text-[var(--muted)]">Log in</a></li>
                    <li><a href="/profile" className="hover:text-[var(--foreground)] text-[var(--muted)]">Profile</a></li>
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] mb-2 font-bold">
                    Built with
                  </div>
                  <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                    <li>Next.js 16 + React 19</li>
                    <li>Tailwind v4</li>
                    <li>Supabase</li>
                    <li>
                      Icons:{" "}
                      <a
                        href="https://game-icons.net"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[var(--foreground)]"
                      >
                        game-icons.net
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="border-t border-[var(--border)]">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
                  <p>© {new Date().getFullYear()} Nexplay · Play. Repeat.</p>
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
          </div>
        </div>
      </body>
    </html>
  );
}
