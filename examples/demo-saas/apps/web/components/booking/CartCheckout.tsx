import { CartSummary } from './CartSummary';

export function CartCheckout() {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-12 lg:grid-cols-[1fr_360px]">
      <aside className="space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Acme Studio
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            30 Min Meeting
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Book a focused 30-minute working session. Bring an agenda and we&apos;ll dig in.
          </p>
        </div>

        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li>📅 Tuesday, June 24, 2026</li>
          <li>🕒 2:00 PM – 2:30 PM (GMT-3)</li>
          <li>💻 Zoom (link sent via email)</li>
        </ul>
      </aside>

      <CartSummary />
    </div>
  );
}
