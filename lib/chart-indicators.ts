// Indicators computed on the client over everything loaded so far, so SMA and
// RSI extend automatically as older history pages load.
import type { OverlayPoint } from './api';

export function smaSeries(ts: number[], closes: number[], period: number): OverlayPoint[] {
  const out: OverlayPoint[] = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]!;
    if (i >= period) sum -= closes[i - period]!;
    if (i >= period - 1) out.push({ ts: ts[i]!, value: sum / period });
  }
  return out;
}

export function rsiSeries(ts: number[], closes: number[], period = 14): OverlayPoint[] {
  const out: OverlayPoint[] = [];
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out.push({ ts: ts[period]!, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out.push({ ts: ts[i]!, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
  }
  return out;
}
