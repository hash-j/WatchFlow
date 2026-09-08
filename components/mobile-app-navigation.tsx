"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Clapperboard, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  AppNavigation,
  getNavigationTitle,
} from "@/components/app-navigation";
import { LogoutButton } from "@/components/logout-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";

export function MobileAppNavigation({
  identity,
  email,
}: {
  identity: string;
  email: string | null;
}) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const currentTitle = getNavigationTitle(pathname);

  function closeDrawer() {
    dialogRef.current?.close();
  }

  useEffect(() => {
    closeDrawer();
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden">
      <div className="flex min-h-16 min-w-0 items-center gap-3 px-4 sm:px-6">
        <Button
          ref={triggerRef}
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Open main navigation"
          aria-haspopup="dialog"
          onClick={() => dialogRef.current?.showModal()}
        >
          <Menu aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted-foreground">
            WatchFlow
          </p>
          <p className="truncate text-sm font-semibold">{currentTitle}</p>
        </div>
        <ThemeSwitcher />
      </div>

      <dialog
        ref={dialogRef}
        aria-label="Main navigation"
        onClose={() => triggerRef.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
        className="fixed inset-y-0 left-0 m-0 h-svh max-h-none w-[min(21rem,calc(100vw-2rem))] max-w-none overflow-hidden border-0 border-r border-white/10 bg-sidebar p-0 text-sidebar-foreground shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex h-full min-w-0 flex-col">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 px-4">
            <Link
              href="/dashboard"
              onClick={closeDrawer}
              className="flex min-w-0 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-active text-rating-foreground">
                <Clapperboard className="size-4" aria-hidden="true" />
              </span>
              <span className="truncate">WatchFlow</span>
            </Link>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close main navigation"
              onClick={closeDrawer}
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          <AppNavigation
            onNavigate={closeDrawer}
            className="flex-1 overflow-y-auto py-4"
          />

          <div className="border-t border-white/10 p-4">
            <p className="break-words text-sm font-medium">{identity}</p>
            {email && email !== identity ? (
              <p className="mt-1 break-all text-xs text-sidebar-muted">
                {email}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <LogoutButton className="border-white/20 bg-transparent text-sidebar-foreground hover:border-white/30 hover:bg-white/10 hover:text-sidebar-foreground" />
              <ThemeSwitcher className="text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground" />
            </div>
          </div>
        </div>
      </dialog>
    </header>
  );
}
