"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES } from "@/lib/catalog";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "./ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { readGuestIdentity, type GuestIdentity } from "@/lib/guest";

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

export function Sidebar({
  isAuthenticated = false,
  adminVisible = false,
}: {
  isAuthenticated?: boolean;
  adminVisible?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const friendsUnread = useFriendsUnread(isAuthenticated);
  // Read the guest identity for non-full-account visitors. Anonymous
  // Supabase users have a `profiles` row; we prefer the display_name
  // off it (so the name they'll appear under on leaderboards matches
  // what's shown here). Falls back to the localStorage random name
  // for visitors whose anonymous auth didn't succeed (eg if the
  // project doesn't have anon auth enabled).
  const [guest, setGuest] = useState<GuestIdentity | null>(null);
  useEffect(() => {
    if (isAuthenticated) {
      setGuest(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const localId = readGuestIdentity();
      // Try to read the live display_name from Supabase first.
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { data: userResp } = await supabase.auth.getUser();
          const u = userResp?.user;
          if (u?.is_anonymous) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("id", u.id)
              .maybeSingle();
            if (!cancelled) {
              setGuest({
                id: u.id,
                name: profile?.display_name ?? localId?.name ?? "Guest",
              });
              return;
            }
          }
        } catch {
          // ignore — fall through to localStorage
        }
      }
      if (!cancelled) setGuest(localId);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

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

  // Swipe-to-close on touch devices. Live-drags the panel so the user
  // gets immediate feedback; if they release past the half-way point
  // (or with enough velocity), the panel closes. Otherwise it snaps
  // back open. Pointer events cover both mouse-on-touchscreen and
  // proper touch.
  const asideRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    startX: number;
    startTime: number;
    pointerId: number;
  } | null>(null);
  const [dragX, setDragX] = useState(0);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse") return; // sidebar still toggles via hamburger
    if (!open) return;
    dragRef.current = {
      startX: e.clientX,
      startTime: performance.now(),
      pointerId: e.pointerId,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // Only register leftward drags — drag right is a no-op so the
    // panel can't overshoot its open position.
    const delta = Math.min(0, e.clientX - d.startX);
    setDragX(delta);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const delta = e.clientX - d.startX;
    const dt = performance.now() - d.startTime;
    // Sidebar is w-56 = 224px. Close on:
    //   • a drag past 70px (~31% of width), or
    //   • a flick (>0.3 px/ms of leftward velocity).
    const velocity = delta / Math.max(1, dt);
    if (delta < -70 || velocity < -0.3) {
      setOpen(false);
    }
    dragRef.current = null;
    setDragX(0);
  };
  const onPointerCancel = () => {
    dragRef.current = null;
    setDragX(0);
  };

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

      {/* On mobile this is a fixed slide-in panel below the header. On
          lg+ the sidebar is a sticky column that fills the visible nav
          area (one viewport minus the header) and tracks the scroll —
          its inner div has overflow-y-auto for users with many
          categories. */}
      <aside
        ref={asideRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // While the user is actively dragging we suppress the
        // transition so the panel tracks their finger 1:1. As soon as
        // the pointer is released and dragX returns to 0, the
        // transition class is back on and the panel snaps into place.
        style={dragX !== 0 ? { transform: `translateX(${dragX}px)` } : undefined}
        className={`fixed lg:sticky top-16 left-0 z-40 lg:z-0 w-56 shrink-0 h-[calc(100vh-4rem)] ${
          dragX !== 0 ? "" : "transition-transform lg:transition-none"
        } ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-full overflow-y-auto p-2 border-r border-[var(--border)] bg-[var(--surface)] lg:bg-transparent">
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
                <NavRow href="/feedback" emoji="💬" label="Feedback" active={isActive("/feedback")} />
                <NavRow href="/settings" emoji="⚙️" label="Settings" active={isActive("/settings")} />
                {adminVisible && (
                  <NavRow href="/admin" emoji="🛡️" label="Admin" active={isActive("/admin")} />
                )}
                <LogoutRow />
              </>
            ) : (
              <>
                <NavRow href="/feedback" emoji="💬" label="Feedback" active={isActive("/feedback")} />
                <NavRow href="/settings" emoji="⚙️" label="Settings" active={isActive("/settings")} />
                {/* "Playing as" pill — surfaces the guest's friendly
                    random name so they have a visible identity. Only
                    renders once the post-hydration effect resolves
                    so the SSR shell doesn't blink it in. */}
                {guest && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-[var(--surface-2)]/60 border border-[var(--border)]">
                    <div className="text-[10px] uppercase tracking-widest text-[var(--muted-2)] font-black">
                      Playing as
                    </div>
                    <div className="text-xs font-bold truncate" title={guest.name}>
                      {guest.name}
                    </div>
                  </div>
                )}
                {/* Prominent sign-up promo for guests — replaces the
                    plain "Log in" NavRow. Sits below the standard
                    account links so the sidebar pattern holds, but
                    visually stands out as a CTA card with copy. */}
                <Link
                  href="/login?mode=signup"
                  className="mt-2 block rounded-xl bg-gradient-to-br from-[var(--accent)]/15 via-[var(--accent-2)]/15 to-[var(--accent-3)]/15 border border-[var(--accent)]/30 p-3 hover:border-[var(--accent)]/60 transition-colors group"
                >
                  <div className="text-xs font-black mb-0.5">
                    Save your scores
                  </div>
                  <div className="text-[11px] text-[var(--muted)] leading-snug mb-2">
                    {guest
                      ? `Take ${guest.name.split(" ").slice(0, 2).join(" ")} to the global leaderboard.`
                      : "Free account · climb global leaderboards · play with friends."}
                  </div>
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white text-[11px] font-black group-hover:scale-[1.03] transition-transform">
                    Sign up free →
                  </div>
                </Link>
                <Link
                  href="/login"
                  className="block text-center text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] mt-1.5 transition-colors"
                >
                  Already have an account? Log in
                </Link>
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
