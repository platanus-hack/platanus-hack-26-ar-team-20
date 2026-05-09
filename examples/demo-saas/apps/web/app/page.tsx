import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Helix demo
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Cal.com fork — cart conversion experiment
      </h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        4 variants of the booking checkout, gated behind PostHog feature flag{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
          exp_cart_conv_2026
        </code>
        .
      </p>
      <Link
        href="/cart"
        className="mt-8 inline-flex w-fit items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        Open /cart →
      </Link>
    </main>
  );
}
