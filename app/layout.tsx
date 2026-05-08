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
        <footer className="border-t border-[var(--border)] mt-16 py-8 text-center text-sm text-[var(--muted)]">
          <p>© {new Date().getFullYear()} Nexplay. Play. Repeat.</p>
        </footer>
      </body>
    </html>
  );
}
