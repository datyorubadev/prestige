"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SearchBox } from "@/components/layout/search";
import { NotificationsBell } from "@/components/layout/notifications";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Prestige home">
      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-primary to-[#2ecf96] text-white shadow-card">
        <Icon name="sparkles" size={17} />
      </span>
      <span className="text-[15px] font-extrabold tracking-tight text-text">Prestige</span>
    </Link>
  );
}

function LiveStatus() {
  return (
    <span className="hidden items-center gap-2 text-meta font-medium text-text-2 md:flex">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      Live
    </span>
  );
}

function UserChip() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  if (!user) return null;

  const roleLabel =
    user.role === "super_admin"
      ? "Super admin"
      : user.role === "customer"
        ? "Customer"
        : user.role === "owner"
          ? "Owner"
          : "Agent";

  const name = user.fullName || user.email || "User";

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2.5 rounded-sm border border-border bg-surface py-1.5 pl-1.5 pr-2.5">
          <Avatar name={name} color={user.color} size="sm" />
          <div className="hidden leading-tight sm:block">
            <p className="text-[12.5px] font-semibold text-text">{name}</p>
            <p className="text-[11px] text-text-2">{roleLabel}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => setShowLogoutConfirm(true)}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-border bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
        >
          <Icon name="log-out" size={18} />
        </button>
      </div>

      <ConfirmModal
        open={showLogoutConfirm}
        title="Sign out of Prestige?"
        description="Are you sure you want to end your current session? You will need to enter your email and password to sign back in."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        icon="log-out"
        tone="danger"
        onConfirm={() => {
          setShowLogoutConfirm(false);
          signOut();
          router.push("/login");
        }}
        onClose={() => setShowLogoutConfirm(false)}
      />
    </>
  );
}

export function Topbar({ bannerActive = false }: { bannerActive?: boolean }) {
  const { role } = useAuth();
  return (
    <header
      className={cn(
        "sticky z-30 h-[56px] shrink-0 border-b border-border bg-[rgba(255,255,255,.92)] backdrop-blur px-4 lg:px-6 flex items-center justify-between gap-4",
      )}
    >
      <div className="flex min-w-0 max-w-xl flex-1 items-center">
        <SearchBox />
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <LiveStatus />
        {role !== "customer" && <NotificationsBell />}
        <UserChip />
      </div>
    </header>
  );
}
