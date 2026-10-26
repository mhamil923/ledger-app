import { useEffect, useState } from 'react';
import { storage } from './storage';

const MIN_WIN_KEY = 'ledger.minWinRate';
export const MIN_WIN_CHOICES = [0.5, 0.6, 0.7] as const;

/**
 * Your bar for a trade idea: the CONSERVATIVE measured win rate it must have
 * (Wilson lower bound of the backtest). Ideas below it are shown as
 * "doesn't meet your bar" instead of as trades.
 */
export function useMinWinRate(): [number, (v: number) => void] {
  const [value, setValue] = useState(0.6);
  useEffect(() => {
    void storage.get(MIN_WIN_KEY).then((v) => {
      const n = Number(v);
      if (v && Number.isFinite(n) && n > 0 && n < 1) setValue(n);
    });
  }, []);
  const set = (v: number): void => {
    setValue(v);
    void storage.set(MIN_WIN_KEY, String(v));
  };
  return [value, set];
}
