// Shared renderer for TradingView Lightweight Charts (Apache-2.0,
// github.com/tradingview/lightweight-charts, v5).
//
// Kept as a plain-JS string so the exact same code runs on web (evaluated with
// `new Function` against the npm package) and on iOS/Android (injected into a
// WebView that loads the standalone build). Hermes can't stringify compiled
// functions, hence the string.
//
// Signature: (LightweightCharts, container, onCrosshair, onNeedMore) => controller
//   onNeedMore()              — called when the view nears the oldest loaded
//                               candle; the app fetches the next older page and
//                               calls setData again (the view stays anchored).
//   controller.setData(data)  — first call builds the chart; later calls update
//                               the series IN PLACE, so zoom/scroll survive the
//                               live refresh. Rebuilds only if the layout
//                               (chart type / panes / overlays) changes.
//   controller.zoom(factor)   — >1 zooms in, <1 zooms out (around the right edge)
//   controller.fit()          — show everything
//   controller.destroy()

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
  /** More (older) history can still be loaded. When false, the chart stops
   *  you from scrolling past the first candle. */
  hasMore?: boolean;
  colors: { bg: string; text: string; grid: string; up: string; down: string; rsi: string };
}

export interface TVChartController {
  setData: (data: TVChartData) => void;
  zoom: (factor: number) => void;
  fit: () => void;
  destroy: () => void;
}

export const RENDER_BODY = `
  var LC = LightweightCharts;
  var chart = null, main = null, overlaySeries = {}, vol = null, rsiS = null, priceLines = [];
  var layoutKey = '', off = 0, fitted = false, userMoved = false, firstTime = null;

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
  function keyOf(d) {
    var useC = d.mode === 'candle' && d.candles && d.candles.length > 0;
    return [useC ? 'candle' : d.mode, (d.overlays || []).map(function (o) { return o.key; }).join(','),
            d.volumes && d.volumes.length ? 'v' : '', d.rsi && d.rsi.length ? 'r' : '', d.intraday ? 'i' : 'd'].join('|');
  }

  function build(d) {
    if (chart) { chart.remove(); }
    overlaySeries = {}; vol = null; rsiS = null; priceLines = []; fitted = false; userMoved = false; firstTime = null;
    var c = d.colors;
    chart = LC.createChart(container, {
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
      timeScale: { borderColor: c.grid, timeVisible: !!d.intraday, secondsVisible: false, rightOffset: 3, minBarSpacing: 0.5 },
      crosshair: { mode: LC.CrosshairMode.Normal },
      // Zoom: mouse wheel / trackpad pinch / touch pinch / drag the price or time axis.
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }
    });
    var useC = d.mode === 'candle' && d.candles && d.candles.length > 0;
    if (useC) {
      main = chart.addSeries(LC.CandlestickSeries, {
        upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false
      });
    } else if (d.mode === 'area') {
      main = chart.addSeries(LC.AreaSeries, { lineColor: c.up, topColor: alpha(c.up, 0.28), bottomColor: alpha(c.up, 0), lineWidth: 2 });
    } else {
      main = chart.addSeries(LC.LineSeries, { color: c.up, lineWidth: 2 });
    }
    (d.overlays || []).forEach(function (o) {
      overlaySeries[o.key] = chart.addSeries(LC.LineSeries, {
        color: o.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: o.label
      });
    });
    var pane = 1;
    if (d.volumes && d.volumes.length) {
      vol = chart.addSeries(LC.HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, pane);
      pane++;
    }
    if (d.rsi && d.rsi.length) {
      rsiS = chart.addSeries(LC.LineSeries, {
        color: c.rsi, lineWidth: 1, priceLineVisible: false, title: 'RSI 14',
        autoscaleInfoProvider: function () { return { priceRange: { minValue: 0, maxValue: 100 } }; }
      }, pane);
      rsiS.createPriceLine({ price: 70, color: alpha(c.down, 0.6), lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: false, title: '' });
      rsiS.createPriceLine({ price: 30, color: alpha(c.up, 0.6), lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: false, title: '' });
    }
    try {
      var panes = chart.panes();
      var total = container.clientHeight || 380;
      if (panes.length === 3) { panes[1].setHeight(Math.round(total * 0.16)); panes[2].setHeight(Math.round(total * 0.22)); }
      else if (panes.length === 2) { panes[1].setHeight(Math.round(total * 0.2)); }
    } catch (e) {}
    chart.subscribeCrosshairMove(function (p) {
      onCrosshair(p && p.time != null && p.point ? (p.time - off) * 1000 : null);
    });
    // Remember that the user zoomed/scrolled so refreshes don't snap back.
    chart.timeScale().subscribeVisibleLogicalRangeChange(function (r) {
      if (fitted) userMoved = true;
      // Near the oldest loaded candle → ask the app for more history.
      if (r && r.from < 25 && typeof onNeedMore === 'function') onNeedMore();
    });
  }

  function update(d) {
    off = (d.tzOffsetMinutes || 0) * 60;
    var c = d.colors;
    var useC = d.mode === 'candle' && d.candles && d.candles.length > 0;
    var first = 0, lastP = 0;
    // Capture the view BEFORE replacing data, so prepending older history
    // can shift the logical range and keep the same candles on screen.
    var prevRange = fitted ? chart.timeScale().getVisibleLogicalRange() : null;
    var prevFirst = firstTime;
    var rows;
    if (useC) {
      rows = uniq(d.candles.map(function (k) { return { time: t(k.ts), open: k.open, high: k.high, low: k.low, close: k.close }; }));
      main.setData(rows);
      if (rows.length) { first = rows[0].open; lastP = rows[rows.length - 1].close; }
    } else {
      rows = uniq(d.points.map(function (p) { return { time: t(p.ts), value: p.price }; }));
      main.setData(rows);
      if (rows.length) { first = rows[0].value; lastP = rows[rows.length - 1].value; }
      var color = lastP >= first ? c.up : c.down;
      if (d.mode === 'area') main.applyOptions({ lineColor: color, topColor: alpha(color, 0.28), bottomColor: alpha(color, 0) });
      else main.applyOptions({ color: color });
    }
    (d.overlays || []).forEach(function (o) {
      var s = overlaySeries[o.key];
      if (s) s.setData(uniq(o.points.map(function (p) { return { time: t(p.ts), value: p.value }; })));
    });
    priceLines.forEach(function (pl) { try { main.removePriceLine(pl); } catch (e) {} });
    priceLines = [];
    (d.levels || []).forEach(function (l) {
      if (!isFinite(l.price)) return;
      priceLines.push(main.createPriceLine({
        price: l.price, color: l.color, lineWidth: 1,
        lineStyle: l.style === 'dashed' ? LC.LineStyle.Dashed : LC.LineStyle.Solid,
        axisLabelVisible: true, title: l.label || ''
      }));
    });
    if (vol) {
      var dir = {};
      if (useC) d.candles.forEach(function (k) { dir[t(k.ts)] = k.close >= k.open; });
      vol.setData(uniq(d.volumes.map(function (v) {
        var up = dir[t(v.ts)];
        return { time: t(v.ts), value: v.value, color: alpha(up === false ? c.down : c.up, 0.45) };
      })));
    }
    if (rsiS) rsiS.setData(uniq(d.rsi.map(function (p) { return { time: t(p.ts), value: p.value }; })));
    var newFirst = rows && rows.length ? rows[0].time : null;
    var added = 0;
    if (prevFirst != null && newFirst != null && newFirst < prevFirst) {
      for (var i = 0; i < rows.length && rows[i].time < prevFirst; i++) added++;
    }
    firstTime = newFirst;
    // While older history exists, let the view run past the first candle
    // (that's what triggers loading more); once it's all loaded, pin it.
    chart.timeScale().applyOptions({ fixLeftEdge: d.hasMore === false });
    if (!fitted) {
      // First paint: show the most recent ~150 candles; scroll back for more.
      var n = rows ? rows.length : 0;
      if (n > 150) chart.timeScale().setVisibleLogicalRange({ from: n - 150, to: n + 2 });
      else chart.timeScale().fitContent();
    } else if (added > 0 && prevRange) {
      chart.timeScale().setVisibleLogicalRange({ from: prevRange.from + added, to: prevRange.to + added });
    } else if (!userMoved) {
      chart.timeScale().fitContent();
    }
    fitted = true;
  }

  return {
    setData: function (d) {
      var k = keyOf(d);
      if (!chart || k !== layoutKey) { build(d); layoutKey = k; }
      update(d);
    },
    zoom: function (factor) {
      if (!chart) return;
      var ts = chart.timeScale();
      var r = ts.getVisibleLogicalRange();
      if (!r) return;
      var span = r.to - r.from;
      var next = Math.max(8, span / factor);
      ts.setVisibleLogicalRange({ from: r.to - next, to: r.to });
      userMoved = true;
    },
    fit: function () { if (chart) { chart.timeScale().fitContent(); userMoved = false; } },
    destroy: function () { if (chart) { chart.remove(); chart = null; } }
  };
`;
