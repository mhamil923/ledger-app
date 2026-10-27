import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import * as LightweightCharts from 'lightweight-charts';
import { RENDER_BODY, type TVChartController, type TVChartData } from '../lib/tvchart-renderer';

type Factory = (
  lc: typeof LightweightCharts,
  container: HTMLElement,
  onCrosshair: (ts: number | null) => void,
  onNeedMore: () => void,
) => TVChartController;

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const create = new Function('LightweightCharts', 'container', 'onCrosshair', 'onNeedMore', RENDER_BODY) as Factory;

export interface TVChartHandle {
  zoom: (factor: number) => void;
  fit: () => void;
}

interface Props {
  data: TVChartData;
  height: number;
  onCrosshair?: (ts: number | null) => void;
  /** Called when the view reaches the oldest loaded candle. */
  onNeedMore?: () => void;
}

/**
 * Web: TradingView Lightweight Charts drawn straight into the DOM. The chart
 * is created once; data updates are applied in place so zoom survives the
 * live refresh.
 */
export const TVChart = forwardRef<TVChartHandle, Props>(function TVChart({ data, height, onCrosshair, onNeedMore }, ref) {
  const viewRef = useRef<View>(null);
  const ctrl = useRef<TVChartController | null>(null);
  const cb = useRef(onCrosshair);
  cb.current = onCrosshair;
  const more = useRef(onNeedMore);
  more.current = onNeedMore;

  useEffect(() => {
    const el = viewRef.current as unknown as HTMLElement | null;
    if (!el) return;
    ctrl.current = create(
      LightweightCharts,
      el,
      (ts) => cb.current?.(ts),
      () => more.current?.(),
    );
    return () => {
      ctrl.current?.destroy();
      ctrl.current = null;
    };
  }, []);

  useEffect(() => {
    ctrl.current?.setData(data);
  }, [data]);

  useImperativeHandle(ref, () => ({
    zoom: (f) => ctrl.current?.zoom(f),
    fit: () => ctrl.current?.fit(),
  }));

  return <View ref={viewRef} style={{ height, width: '100%' }} />;
});
