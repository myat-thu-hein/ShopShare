'use client';

import { useEffect, useState } from 'react';

/** Time left until midnight in Bangkok (UTC+7), when today's deals reset. */
function secondsToMidnightBangkok(now = Date.now()) {
  const bangkok = new Date(now + 7 * 3_600_000);
  const elapsed = bangkok.getUTCHours() * 3600 + bangkok.getUTCMinutes() * 60 + bangkok.getUTCSeconds();
  return 86_400 - elapsed;
}

export function Countdown() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    setLeft(secondsToMidnightBangkok());
    const t = setInterval(() => setLeft(secondsToMidnightBangkok()), 1000);
    return () => clearInterval(t);
  }, []);
  const parts =
    left == null
      ? ['--', '--', '--']
      : [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60].map((n) =>
          String(n).padStart(2, '0'),
        );
  return (
    <span
      className="inline-flex items-center gap-1"
      role="timer"
      aria-label={
        left == null ? 'Deals end at midnight' : `Deals end in ${parts[0]} hours ${parts[1]} minutes`
      }
    >
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden className="font-bold">
              :
            </span>
          ) : null}
          <span className="grid min-w-8 place-items-center rounded-md bg-ink px-1.5 py-1 font-display text-sm font-bold tabular-nums text-paper">
            {p}
          </span>
        </span>
      ))}
    </span>
  );
}
