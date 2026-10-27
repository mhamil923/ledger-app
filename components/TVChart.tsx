import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { LIGHTWEIGHT_CHARTS_VERSION, RENDER_BODY, type TVChartData } from '../lib/tvchart-renderer';

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
 * iOS / Android: TradingView Lightweight Charts inside a WebView (the library
 * needs a DOM). The chart is created once in the page; data updates are
 * injected and applied in place, so pinch-zoom survives the live refresh.
 * (Web uses TVChart.web.tsx instead.)
 */
export const TVChart = forwardRef<TVChartHandle, Props>(function TVChart({ data, height, onCrosshair, onNeedMore }, ref) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const html = useMemo(
    () => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#c{margin:0;padding:0;height:100%;width:100%;background:${data.colors.bg};overflow:hidden;touch-action:none}</style>
<script src="https://unpkg.com/lightweight-charts@${LIGHTWEIGHT_CHARTS_VERSION}/dist/lightweight-charts.standalone.production.js"></script>
</head><body><div id="c"></div><script>
var create = function (LightweightCharts, container, onCrosshair, onNeedMore) {${RENDER_BODY}};
var lastMore = 0;
window.__chart = create(LightweightCharts, document.getElementById('c'), function (ts) {
  window.ReactNativeWebView.postMessage(JSON.stringify({ ts: ts }));
}, function () {
  var now = Date.now();
  if (now - lastMore < 500) return;
  lastMore = now;
  window.ReactNativeWebView.postMessage(JSON.stringify({ more: true }));
});
</script></body></html>`,
    // The page only needs rebuilding if the background color changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.colors.bg],
  );

  useEffect(() => {
    if (!ready) return;
    webRef.current?.injectJavaScript(`window.__chart && window.__chart.setData(${JSON.stringify(data)}); true;`);
  }, [data, ready]);

  useImperativeHandle(ref, () => ({
    zoom: (f) => webRef.current?.injectJavaScript(`window.__chart && window.__chart.zoom(${Number(f)}); true;`),
    fit: () => webRef.current?.injectJavaScript('window.__chart && window.__chart.fit(); true;'),
  }));

  const onMessage = (e: WebViewMessageEvent): void => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { ts?: number | null; more?: boolean };
      if (msg.more) onNeedMore?.();
      else onCrosshair?.(msg.ts ?? null);
    } catch {
      // ignore
    }
  };

  return (
    <View style={{ height, width: '100%' }}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        onLoadEnd={() => setReady(true)}
        onMessage={onMessage}
        scrollEnabled={false}
        bounces={false}
        style={{ backgroundColor: data.colors.bg }}
        javaScriptEnabled
      />
    </View>
  );
});
