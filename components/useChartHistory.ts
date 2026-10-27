import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, type AssetType, type ChartInterval, type HistoryCandle } from '../lib/api';

const PAGE = 300;
/** How often the newest candles refresh while the chart is open. */
const LIVE_MS: Record<ChartInterval, number> = {
  '5m': 15_000,
  '15m': 15_000,
  '1h': 30_000,
  '4h': 60_000,
  '1d': 60_000,
  '1w': 120_000,
};

function merge(a: HistoryCandle[], b: HistoryCandle[]): HistoryCandle[] {
  const m = new Map<number, HistoryCandle>();
  for (const c of a) m.set(c.ts, c);
  for (const c of b) m.set(c.ts, c);
  return [...m.values()].sort((x, y) => x.ts - y.ts);
}

/**
 * Candle history for one symbol + timeframe. Loads the newest page first,
 * then `loadMore()` fetches the next older page (called when you scroll or
 * zoom out to the left edge). The newest candles refresh live.
 */
export function useChartHistory(
  item: { symbol: string; asset_type: AssetType; external_id?: string | null } | null,
  interval: ChartInterval,
  active: boolean,
) {
  const [candles, setCandles] = useState<HistoryCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0); // bumps on symbol/interval change so stale responses are dropped
  const busyMore = useRef(false);
  const fixedOnly = useRef(false); // legacy fallback: no paging, no live merge
  const candlesRef = useRef<HistoryCandle[]>([]);
  candlesRef.current = candles;

  useEffect(() => {
    if (!item || !active) return;
    const my = ++gen.current;
    fixedOnly.current = false;
    setCandles([]);
    setHasMore(true);
    setUnavailable(false);
    setError(null);
    setLoading(true);
    apiClient
      .getChartHistory({ symbol: item.symbol, asset_type: item.asset_type, interval, limit: PAGE })
      .then(async (p) => {
        if (my !== gen.current) return;
        if (p.source !== 'unavailable') {
          setUnavailable(false);
          setCandles(p.candles);
          setHasMore(p.has_more);
          return;
        }
        // Not on Coinbase / no Twelve Data: fall back to the old fixed 1-year
        // chart (CoinGecko for small coins). No paging in this mode.
        const legacy = await apiClient.getChart({
          symbol: item.symbol,
          asset_type: item.asset_type,
          external_id: item.external_id ?? undefined,
          range: '1y',
          chart_type: 'candle',
        });
        if (my !== gen.current) return;
        const vol = new Map(legacy.volumes.map((v) => [v.ts, v.value]));
        const cs: HistoryCandle[] = legacy.candles.length
          ? legacy.candles.map((c) => ({ ...c, volume: vol.get(c.ts) ?? 0 }))
          : legacy.points.map((pt) => ({ ts: pt.ts, open: pt.price, high: pt.price, low: pt.price, close: pt.price, volume: vol.get(pt.ts) ?? 0 }));
        setUnavailable(legacy.source === 'unavailable');
        setCandles(cs);
        setHasMore(false);
        fixedOnly.current = true;
      })
      .catch((err) => {
        if (my === gen.current) setError(err instanceof Error ? err.message : 'Chart failed');
      })
      .finally(() => {
        if (my === gen.current) setLoading(false);
      });
  }, [item?.symbol, item?.asset_type, interval, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    const oldest = candlesRef.current[0];
    if (!item || !oldest || busyMore.current || !hasMore || fixedOnly.current) return;
    busyMore.current = true;
    const my = gen.current;
    setLoadingMore(true);
    apiClient
      .getChartHistory({ symbol: item.symbol, asset_type: item.asset_type, interval, before: oldest.ts, limit: PAGE })
      .then((p) => {
        if (my !== gen.current) return;
        setCandles((prev) => merge(p.candles, prev));
        setHasMore(p.has_more && p.candles.length > 0);
      })
      .catch(() => {
        /* try again on the next scroll */
      })
      .finally(() => {
        busyMore.current = false;
        if (my === gen.current) setLoadingMore(false);
      });
  }, [item, interval, hasMore]);

  // Live: refresh the newest candles and merge them in.
  useEffect(() => {
    if (!item || !active) return;
    const tick = (): void => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (fixedOnly.current) return;
      const my = gen.current;
      apiClient
        .getChartHistory({ symbol: item.symbol, asset_type: item.asset_type, interval, limit: 50 })
        .then((p) => {
          if (my === gen.current && p.candles.length) setCandles((prev) => merge(prev, p.candles));
        })
        .catch(() => undefined);
    };
    const h = setInterval(tick, LIVE_MS[interval]);
    return () => clearInterval(h);
  }, [item?.symbol, item?.asset_type, interval, active]); // eslint-disable-line react-hooks/exhaustive-deps

  return { candles, loading, loadingMore, hasMore, unavailable, error, loadMore };
}
