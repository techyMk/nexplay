"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES } from "@/lib/catalog";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "./ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type NavItem = {
  href: string;
  emoji: string;
  label: string;
  hot?: boolean;
};

const TOP_NAV: NavItem[] = [
  { href: "/", emoji: "🏠", label: "Home" },
  { href: "/daily", emoji: "🎯", label: "Daily" },
  { href: "/multiplayer", emoji: "👥", label: "Multiplayer", hot: true },
  { href: "/guide", emoji: "📖", label: "How to play" },
];

function useFriendsUnread(authed: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!authed || !isSupabaseConfigured) return;
    const supabase = createClient();
    let cancelled = false;

    const refresh = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const [{ count: incoming }, { count: invites }] = await Promise.all([
        supabase
          .from("friendships")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .neq("initiated_by", user.id)
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
        supabase
          .from("game_invites")
          .select("*", { count: "exact", head: true })
          .eq("to_user", user.id)
          .eq("status", "pending"),
      ]);
      if (cancelled) return;
      setCount((incoming ?? 0) + (invites ?? 0));
    };

    refresh();

    const channel = supabase
      .channel("sidebar-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_invites" },
        refresh,
      )
      .subscribe();

    const id = setInterval(refresh, 30_000);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(id);
    };
  }, [authed]);

  return count;
}

export function Sidebar({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const friendsUnread = useFriendsUnread(isAuthenticated);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Listen for the global toggle event dispatched by the Header hamburger.
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onClose = () => setOpen(false);
    window.addEventListener("nexplay:toggle-sidebar", onToggle);
    window.addEventListener("nexplay:close-sidebar", onClose);
    return () => {
      window.removeEventListener("nexplay:toggle-sidebar", onToggle);
      window.removeEventListener("nexplay:close-sidebar", onClose);
    };
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const isCategoryActive = (slug: string) => pathname === `/category/${slug}`;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* On mobile this is a fixed slide-in panel that always fills the
          viewport below the header. On lg+ it's a sticky column whose
          height is capped at one viewport so position:sticky cleanly
          stops at the flex row's bottom edge — i.e. exactly where the
          footer starts — without ever overlapping it. */}
      <aside
        className={`fixed lg:sticky top-16 left-0 z-40 lg:z-0 w-56 shrink-0 transition-transform lg:transition-none h-[calc(100vh-4rem)] lg:h-auto lg:self-start lg:max-h-[calc(100vh-4rem)] ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-full lg:max-h-[calc(100vh-4rem)] overflow-y-auto p-2 border-r border-[var(--border)] bg-[var(--surface)] lg:bg-transparent">
          <nav className="space-y-0.5">
            {TOP_NAV.map((item) => (
              <NavRow
                key={item.href}
                href={item.href}
                emoji={item.emoji}
                label={item.label}
                active={isActive(item.href)}
                hot={item.hot}
              />
            ))}
          </nav>

          <div className="mt-4 px-3 mb-1.5">
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold">
              Categories
            </div>
          </div>

          <nav className="space-y-0.5">
            {CATEGORIES.map((cat) => (
              <NavRow
                key={cat.slug}
                href={`/category/${cat.slug}`}
                emoji={cat.emoji}
                label={cat.title}
                active={isCategoryActive(cat.slug)}
              />
            ))}
          </nav>

          <div className="mt-4 px-3 mb-1.5">
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-bold">
              Account
            </div>
          </div>

          <nav className="space-y-0.5">
            {isAuthenticated ? (
              <>
                <NavRow href="/friends" emoji="👥" label="Friends" active={isActive("/friends")} count={friendsUnread} />
                <NavRow href="/achievements" emoji="🏆" label="Achievements" active={isActive("/achievements")} />
                <NavRow href="/profile" emoji="👤" label="Profile" active={isActive("/profile")} />
                <NavRow href="/settings" emoji="⚙️" label="Settings" active={isActive("/settings")} />
                <LogoutRow />
              </>
            ) : (
              <>
                <NavRow href="/settings" emoji="⚙️" label="Settings" active={isActive("/settings")} />
                <NavRow href="/login" emoji="🔑" label="Log in" active={isActive("/login")} />
              </>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}

function LogoutRow() {
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await confirm({
      icon: "lucide:log-out",
      title: "Log out?",
      message: "You can sign back in any time to keep saving scores.",
      confirmText: "Log out",
      danger: true,
    });
    if (ok) formRef.current?.submit();
  };

  return (
    <form ref={formRef} action="/logout" method="post" onSubmit={onSubmit}>
      <button
        type="submit"
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-[var(--muted)] hover:text-red-500 hover:bg-red-50 transition-colors"
      >
        <span className="text-lg leading-none">🚪</span>
        <span className="flex-1 text-left">Log out</span>
      </button>
    </form>
  );
}

function NavRow({
  href,
  emoji,
  label,
  active,
  hot,
  count,
}: {
  href: string;
  emoji: string;
  label: string;
  active: boolean;
  hot?: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--surface-2)] text-[var(--foreground)] font-bold"
          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
      }`}
    >
      <span className="text-lg leading-none">{emoji}</span>
      <span className="flex-1">{label}</span>
      {count && count > 0 ? (
        <span
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black leading-none"
          aria-label={`${count} pending`}
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : hot ? (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      ) : null}
    </Link>
  );
}
