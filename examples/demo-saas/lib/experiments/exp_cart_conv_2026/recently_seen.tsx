'use client';
import Control, { type CartProps } from './control';

const RECENT = [
  { name: 'María G.', when: '2 min ago', service: 'Strategy Call' },
  { name: 'Felipe R.', when: '7 min ago', service: '30 Min Meeting' },
  { name: 'Anita S.', when: '14 min ago', service: 'Product Demo' },
] as const;

export default function RecentlySeen(props: CartProps) {
  return (
    <div data-testid="cart-recently-seen" className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Live activity
      </p>
      <ul className="space-y-2">
        {RECENT.map((r) => (
          <li
            key={r.name}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            <span className="text-slate-700 dark:text-slate-300">
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {r.name}
              </strong>
              {' booked '}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {r.service}
              </span>
            </span>
            <span className="ml-auto text-xs text-slate-500">{r.when}</span>
          </li>
        ))}
      </ul>
      <Control {...props} />
    </div>
  );
}
