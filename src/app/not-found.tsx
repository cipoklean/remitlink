import Link from "next/link";

/**
 * 404 (owner report: the default Next.js page had no way back home).
 *
 * Kept as a plain server component with only `Link` and the app's layout
 * classes - no client boundary - so it renders instantly and matches the
 * cream/serif design system used on every other screen.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-10 md:max-w-2xl md:px-8">
      <h1 className="font-serif text-4xl leading-tight tracking-tight">
        Lost the link
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        This page does not exist. The link may be missing part of its address,
        or the money it pointed to may already have been claimed elsewhere.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/"
          className="w-full rounded-full bg-accent px-5 py-3.5 text-center text-sm font-medium text-white transition-opacity active:scale-[0.98]"
        >
          Back to RemitLink
        </Link>
        <p className="mt-1 text-center text-xs text-muted">
          Or start fresh with a new send from the home screen.
        </p>
      </div>
    </main>
  );
}
