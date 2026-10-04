"use client";

import Link from "next/link";

export function Shell({
  title,
  subtitle,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 py-8">
      {back ? (
        <Link
          href={back.href}
          className="mb-6 text-sm text-muted underline-offset-4 hover:underline"
        >
          ← {back.label}
        </Link>
      ) : null}
      <h1 className="font-serif text-3xl leading-tight tracking-tight">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-sm text-muted">{subtitle}</p>
      ) : null}
      <div className="mt-6 flex-1">{children}</div>
    </main>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-white/70 p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full bg-accent px-5 py-3.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full border border-line bg-white/70 px-5 py-3.5 text-sm font-medium text-foreground transition-opacity disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-line bg-white/70 text-muted",
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-teal-200 bg-accent-soft text-accent",
  } as const;
  return (
    <p
      className={`rounded-xl border px-3 py-2.5 text-sm ${tones[tone]}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}

/** Persistent honesty marker for anything simulated (AGENT.md rule 4). */
export function MockBadge({ label = "MOCK" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium tracking-wide text-amber-800">
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/40 px-5 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted">{label}</p>
  );
}