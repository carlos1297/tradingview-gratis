import type { Candle, Timeframe } from "./types";
import { WS_HOSTS } from "./endpoints";

interface KlineMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    k: {
      t: number; // open time
      T: number; // close time
      s: string;
      i: string;
      o: string;
      c: string;
      h: string;
      l: string;
      v: string;
      x: boolean; // is closed
    };
  };
}

interface MiniTickerMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    c: string; // close
    o: string; // open
    h: string;
    l: string;
    v: string;
    q: string;
  };
}

interface AggTradeMsg {
  stream: string;
  data: {
    e: "aggTrade";
    E: number;
    s: string;
    p: string; // price
    q: string; // quantity (base asset)
    T: number; // trade time (ms)
    m: boolean; // is the buyer the market maker
  };
}

type WSMsg = KlineMsg | MiniTickerMsg | AggTradeMsg;

/**
 * Un trade agregado de Binance (@aggTrade). `buyerMaker` (flag `m`): true → el
 * comprador es maker, o sea el agresor fue un vendedor → es venta; false →
 * compra agresiva. Base para el Order Flow (delta/CVD) con métricas exactas.
 */
export interface AggTrade {
  symbol: string;
  time: number; // ms
  price: number;
  qty: number; // base asset
  buyerMaker: boolean;
}

export interface KlineSubscription {
  symbol: string;
  interval: Timeframe;
  onCandle: (c: Candle) => void;
}

export interface TickerSubscription {
  symbols: string[];
  onTick: (s: { symbol: string; close: number; open: number; pct: number }) => void;
}

/**
 * Single multiplexed WS connection to Binance, with auto-reconnect.
 * Subscriptions can be added/removed at runtime via SUBSCRIBE/UNSUBSCRIBE.
 * Each stream admits several handlers; the stream is unsubscribed from
 * Binance only when the last handler leaves.
 */
export class BinanceWS {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private klineSubs = new Map<string, Set<KlineSubscription>>();
  private tickerSubs = new Map<string, Set<(m: MiniTickerMsg["data"]) => void>>();
  private aggTradeSubs = new Map<string, Set<(t: AggTrade) => void>>();
  private connected = false;
  private closing = false;

  connect() {
    if (this.ws || this.closing) return;
    // alterna de host en cada reconexión: arranca por el mirror .vision y cae
    // al dominio clásico si aquel está bloqueado (y viceversa).
    const host = WS_HOSTS[this.reconnectAttempts % WS_HOSTS.length];
    this.ws = new WebSocket(host);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      // Re-subscribe everything
      const streams = [
        ...this.klineSubs.keys(),
        ...this.tickerSubs.keys(),
        ...this.aggTradeSubs.keys(),
      ];
      if (streams.length > 0) this.send({ method: "SUBSCRIBE", params: streams, id: this.nextId++ });
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WSMsg | { result: unknown; id: number };
        if ("stream" in msg) this.dispatch(msg);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (!this.closing) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(payload: object) {
    if (this.ws && this.connected) this.ws.send(JSON.stringify(payload));
  }

  private dispatch(msg: WSMsg) {
    if (msg.stream.includes("@kline_")) {
      const subs = this.klineSubs.get(msg.stream);
      if (!subs) return;
      const k = (msg as KlineMsg).data.k;
      const candle: Candle = {
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isFinal: k.x,
      };
      subs.forEach((sub) => sub.onCandle(candle));
    } else if (msg.stream.includes("@miniTicker")) {
      const handlers = this.tickerSubs.get(msg.stream);
      if (handlers) handlers.forEach((h) => h((msg as MiniTickerMsg).data));
    } else if (msg.stream.includes("@aggTrade")) {
      const handlers = this.aggTradeSubs.get(msg.stream);
      if (!handlers) return;
      const d = (msg as AggTradeMsg).data;
      const trade: AggTrade = {
        symbol: d.s,
        time: d.T,
        price: parseFloat(d.p),
        qty: parseFloat(d.q),
        buyerMaker: d.m,
      };
      handlers.forEach((h) => h(trade));
    }
  }

  /** Adds a handler to `map[stream]`; SUBSCRIBEs only on the first one. */
  private addToStream<H>(map: Map<string, Set<H>>, stream: string, handler: H) {
    let handlers = map.get(stream);
    if (!handlers) {
      handlers = new Set();
      map.set(stream, handlers);
      if (this.connected) this.send({ method: "SUBSCRIBE", params: [stream], id: this.nextId++ });
    }
    handlers.add(handler);
  }

  /** Removes a handler; UNSUBSCRIBEs when the stream has none left. */
  private removeFromStream<H>(map: Map<string, Set<H>>, stream: string, handler: H) {
    const handlers = map.get(stream);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      map.delete(stream);
      if (this.connected) this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.nextId++ });
    }
  }

  subscribeKline(sub: KlineSubscription): () => void {
    const stream = `${sub.symbol.toLowerCase()}@kline_${sub.interval}`;
    this.addToStream(this.klineSubs, stream, sub);
    return () => {
      this.removeFromStream(this.klineSubs, stream, sub);
    };
  }

  subscribeMiniTickers(
    symbols: string[],
    onTick: (s: { symbol: string; close: number; open: number; pct: number }) => void,
  ): () => void {
    const handler = (d: MiniTickerMsg["data"]) => {
      const close = parseFloat(d.c);
      const open = parseFloat(d.o);
      onTick({
        symbol: d.s,
        close,
        open,
        pct: open === 0 ? 0 : ((close - open) / open) * 100,
      });
    };
    const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`);
    streams.forEach((stream) => this.addToStream(this.tickerSubs, stream, handler));
    return () => {
      streams.forEach((stream) => this.removeFromStream(this.tickerSubs, stream, handler));
    };
  }

  /** Suscribe al flujo de trades agregados (@aggTrade) de un par, en vivo. */
  subscribeAggTrade(symbol: string, onTrade: (t: AggTrade) => void): () => void {
    const stream = `${symbol.toLowerCase()}@aggTrade`;
    this.addToStream(this.aggTradeSubs, stream, onTrade);
    return () => {
      this.removeFromStream(this.aggTradeSubs, stream, onTrade);
    };
  }

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

// Singleton — only one WS connection per browser tab
let singleton: BinanceWS | null = null;
export function getBinanceWS(): BinanceWS {
  if (typeof window === "undefined") {
    // SSR safety: dummy
    return new BinanceWS();
  }
  if (!singleton) {
    singleton = new BinanceWS();
    singleton.connect();
  }
  return singleton;
}
