import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import * as LightweightCharts from 'lightweight-charts';
import { RENDER_BODY, type TVChartData } from '../lib/tvchart-renderer';

type Renderer = (
  lc: typeof LightweightCharts,
  container: HTMLElement,
  data: TVChartData,
  onCrosshair: (ts: number | null) => void,
) => { destroy: () => void };

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const render = new Function('LightweightCharts', 'container', 'data', 'onCrosshair', RENDER_BODY) as Renderer;

interface Props {
  data: TVChartData;
  height: number;
  onCrosshair?: (ts: number | null) => void;
}

/** Web: TradingView Lightweight Charts drawn straight into the DOM. */
export function TVChart({ data, height, onCrosshair }: Props) {
  const ref = useRef<View>(null);
  const cb = useRef(onCrosshair);
  cb.current = onCrosshair;

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    const chart = render(LightweightCharts, el, data, (ts) => cb.current?.(ts));
    return () => chart.destroy();
  }, [data]);

  return <View ref={ref} style={{ height, width: '100%' }} />;
}
