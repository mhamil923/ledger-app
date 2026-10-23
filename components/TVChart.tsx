import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { LIGHTWEIGHT_CHARTS_VERSION, RENDER_BODY, type TVChartData } from '../lib/tvchart-renderer';

interface Props {
  data: TVChartData;
  height: number;
  onCrosshair?: (ts: number | null) => void;
}

/**
 * iOS / Android: TradingView Lightweight Charts inside a WebView (the library
 * needs a DOM). Data is pushed in with injectJavaScript; crosshair moves come
 * back with postMessage. (Web uses TVChart.web.tsx instead.)
 */
export function TVChart({ data, height, onCrosshair }: Props) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const html = useMemo(
    () => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#c{margin:0;padding:0;height:100%;width:100%;background:${data.colors.bg};overflow:hidden}</style>
<script src="https://unpkg.com/lightweight-charts@${LIGHTWEIGHT_CHARTS_VERSION}/dist/lightweight-charts.standalone.production.js"></script>
</head><body><div id="c"></div><script>
var render = function (LightweightCharts, container, data, onCrosshair) {${RENDER_BODY}};
var current = null;
window.__draw = function (data) {
  if (current) current.destroy();
  current = render(LightweightCharts, document.getElementById('c'), data, function (ts) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ts: ts }));
  });
};
</script></body></html>`,
    // The page only needs rebuilding if the background color changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.colors.bg],
  );

  useEffect(() => {
    if (!ready) return;
    webRef.current?.injectJavaScript(`window.__draw(${JSON.stringify(data)}); true;`);
  }, [data, ready]);

  const onMessage = (e: WebViewMessageEvent): void => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { ts: number | null };
      onCrosshair?.(msg.ts);
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
}
