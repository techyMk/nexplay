import type { Metadata } from "next";
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
                    <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)] flex items-center justify-center text-xs font-black text-white">
                      N
                    </div>
                    <span className="font-black text-sm">
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
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs text-[var(--muted)]">
                  <p>© {new Date().getFullYear()} Nexplay</p>
                  <p>Play. Repeat.</p>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
