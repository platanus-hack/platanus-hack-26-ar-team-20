'use client';
import { useEffect, useState } from 'react';
import Control, { type CartProps } from './control';

const FIFTEEN_MIN = 15 * 60;

function format(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function UrgencyTimer(props: CartProps) {
  const [secondsLeft, setSecondsLeft] = useState(FIFTEEN_MIN);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [secondsLeft]);

  return (
    <div data-testid="cart-urgency-timer" className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            Hold expires in
          </span>
          <span
            data-testid="countdown"
            className="font-mono text-lg font-semibold text-amber-900 dark:text-amber-200"
          >
            {format(secondsLeft)}
          </span>
        </div>
        <span className="text-right text-xs font-medium text-amber-900 dark:text-amber-300">
          Solo quedan
          <br />
          <strong className="text-base">2 lugares</strong>
        </span>
      </div>
      <Control {...props} />
    </div>
  );
}
