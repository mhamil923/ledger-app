// Shared renderer for TradingView Lightweight Charts (Apache-2.0,
// github.com/tradingview/lightweight-charts, v5).
//
// It's kept as a plain-JS string so the exact same code runs in two places:
//   * web: evaluated with `new Function` against the npm package
//   * iOS/Android: injected into a WebView that loads the standalone build
// (Hermes can't stringify compiled functions, hence the string.)
//
// Arguments: LightweightCharts, container (DOM element), data (TVChartData),
// onCrosshair(tsMs | null). Returns { destroy() }.

import type { Candle, ChartPoint, OverlayPoint, VolumePoint } from './api';

export const LIGHTWEIGHT_CHARTS_VERSION = '5.2.1';

export interface TVChartData {
  mode: 'line' | 'area' | 'candle';
  points: ChartPoint[];
  candles: Candle[];
  overlays: Array<{ key: string; label: string; color: string; points: OverlayPoint[] }>;
  volumes: VolumePoint[];
  rsi: OverlayPoint[];
  levels: Array<{ price: number; label?: string; color: string; style?: 'solid' | 'dashed' }>;
  intraday: boolean;
  /** Minutes east of UTC, so the time axis shows local time. */
  tzOffsetMinutes: number;
  colors: { bg: string; text: string; grid: string; up: string; down: string; rsi: string };
}

export const RENDER_BODY = `
  var LC = LightweightCharts;
  var off = (data.tzOffsetMinutes || 0) * 60;
  function t(ms) { return Math.floor(ms / 1000) + off; }
  function uniq(rows) {
    var out = []; var last = -Infinity;
    rows.sort(function (a, b) { return a.time - b.time; });
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].time > last) { out.push(rows[i]); last = rows[i].time; }
      else if (rows[i].time === last) { out[out.length - 1] = rows[i]; }
    }
    return out;
  }
  function alpha(hex, a) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  var c = data.colors;
  var chart = LC.createChart(container, {
    autoSize: true,
    layout: {
      background: { type: 'solid', color: c.bg },
      textColor: c.text,
      fontSize: 11,
      fontFamily: '-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif',
      panes: { separatorColor: c.grid, separatorHoverColor: alpha(c.text, 0.1), enableResize: true }
    },
    grid: { vertLines: { color: alpha(c.grid, 0.6) }, horzLines: { color: alpha(c.grid, 0.6) } },
    rightPriceScale: { borderColor: c.grid },
    timeScale: { borderColor: c.grid, timeVisible: !!data.intraday, secondsVisible: false, rightOffset: 2 },
    crosshair: { mode: LC.CrosshairMode.Normal }
  });

  var useCandles = data.mode === 'candle' && data.candles && data.candles.length > 0;
  var main;
  var first = 0, lastPrice = 0;
  if (useCandles) {
    main = chart.addSeries(LC.CandlestickSeries, {
      upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false
    });
    var cs = uniq(data.candles.map(function (k) {
      return { time: t(k.ts), open: k.open, high: k.high, low: k.low, close: k.close };
    }));
    main.setData(cs);
    if (cs.length) { first = cs[0].open; lastPrice = cs[cs.length - 1].close; }
  } else {
    var ps = uniq(data.points.map(function (p) { return { time: t(p.ts), value: p.price }; }));
    if (ps.length) { first = ps[0].value; lastPrice = ps[ps.length - 1].value; }
    var color = lastPrice >= first ? c.up : c.down;
    if (data.mode === 'area') {
      main = chart.addSeries(LC.AreaSeries, {
        lineColor: color, topColor: alpha(color, 0.28), bottomColor: alpha(color, 0), lineWidth: 2
      });
    } else {
      main = chart.addSeries(LC.LineSeries, { color: color, lineWidth: 2 });
    }
    main.setData(ps);
  }

  (data.overlays || []).forEach(function (o) {
    var s = chart.addSeries(LC.LineSeries, {
      color: o.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: o.label
    });
    s.setData(uniq(o.points.map(function (p) { return { time: t(p.ts), value: p.value }; })));
  });

  (data.levels || []).forEach(function (l) {
    if (!isFinite(l.price)) return;
    main.createPriceLine({
      price: l.price, color: l.color, lineWidth: 1,
      lineStyle: l.style === 'dashed' ? LC.LineStyle.Dashed : LC.LineStyle.Solid,
      axisLabelVisible: true, title: l.label || ''
    });
  });

  var pane = 1;
  if (data.volumes && data.volumes.length) {
    var dir = {};
    if (useCandles) data.candles.forEach(function (k) { dir[t(k.ts)] = k.close >= k.open; });
    var vol = chart.addSeries(LC.HistogramSeries, {
      priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false
    }, pane);
    vol.setData(uniq(data.volumes.map(function (v) {
      var up = dir[t(v.ts)];
      return { time: t(v.ts), value: v.value, color: alpha(up === false ? c.down : c.up, 0.45) };
    })));
    pane++;
  }
  if (data.rsi && data.rsi.length) {
    var rsi = chart.addSeries(LC.LineSeries, {
      color: c.rsi, lineWidth: 1, priceLineVisible: false, title: 'RSI 14',
      autoscaleInfoProvider: function () { return { priceRange: { minValue: 0, maxValue: 100 } }; }
    }, pane);
    rsi.setData(uniq(data.rsi.map(function (p) { return { time: t(p.ts), value: p.value }; })));
    rsi.createPriceLine({ price: 70, color: alpha(c.down, 0.6), lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: false, title: '' });
    rsi.createPriceLine({ price: 30, color: alpha(c.up, 0.6), lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: false, title: '' });
    pane++;
  }
  try {
    var panes = chart.panes();
    var total = container.clientHeight || 380;
    if (panes.length === 3) { panes[1].setHeight(Math.round(total * 0.16)); panes[2].setHeight(Math.round(total * 0.22)); }
    else if (panes.length === 2) { panes[1].setHeight(Math.round(total * 0.2)); }
  } catch (e) {}

  chart.timeScale().fitContent();
  chart.subscribeCrosshairMove(function (p) {
    onCrosshair(p && p.time != null && p.point ? (p.time - off) * 1000 : null);
  });
  return { destroy: function () { chart.remove(); } };
`;
