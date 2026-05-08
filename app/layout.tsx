import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";

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
    "Nexplay is a global gaming hub with hundreds of free browser games. No downloads, no logins required.",
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
        <main className="flex-1">{children}</main>
        <footer className="mt-20 border-t border-[var(--border)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)] flex items-center justify-center text-sm font-black">
                  N
                </div>
                <span className="font-black">
                  Nex<span className="text-gradient">play</span>
                </span>
              </div>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Free browser games. No downloads, no logins required to play.
                Sign in to save scores and play with friends.
              </p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-3 font-bold">
                Play
              </div>
              <ul className="space-y-2 text-sm">
                <li><a href="/" className="hover:text-white text-[var(--muted)]">Home</a></li>
                <li><a href="/multiplayer" className="hover:text-white text-[var(--muted)]">Multiplayer</a></li>
                <li><a href="/category/puzzle" className="hover:text-white text-[var(--muted)]">Puzzle</a></li>
                <li><a href="/category/action" className="hover:text-white text-[var(--muted)]">Action</a></li>
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-3 font-bold">
                Account
              </div>
              <ul className="space-y-2 text-sm">
                <li><a href="/login" className="hover:text-white text-[var(--muted)]">Log in</a></li>
                <li><a href="/profile" className="hover:text-white text-[var(--muted)]">Profile</a></li>
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-3 font-bold">
                Built with
              </div>
              <ul className="space-y-2 text-sm text-[var(--muted)]">
                <li>Next.js 16 + React 19</li>
                <li>Tailwind v4</li>
                <li>Supabase</li>
                <li>Framer Motion</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[var(--border)]">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between text-xs text-[var(--muted)]">
              <p>© {new Date().getFullYear()} Nexplay. Play. Repeat.</p>
              <p>Made with 💜 for browser-game lovers.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
