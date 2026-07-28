import type { AggTrade } from "@/lib/binance/ws";

/**
 * Footprint (Bid×Ask por nivel de precio dentro de cada vela). Se arma con los
 * aggTrades reales (flag `m`): `bid` = volumen de venta agresora (comprador
 * maker), `ask` = volumen de compra agresora. Solo métricas exactas, sin
 * heurísticas. Es en vivo: solo tiene datos de las velas transcurridas desde
 * que se activó (no hay historial exacto sin bajar todos los trades del par).
 */

export interface CeldaFP {
  /** Venta agresora (comprador es maker) */
  bid: number;
  /** Compra agresora */
  ask: number;
}

export interface VelaFP {
  time: number; // apertura de la vela (unix segundos)
  /** nivelIdx (= floor(precio/tick)) → celda bid/ask */
  niveles: Map<number, CeldaFP>;
  totalBid: number;
  totalAsk: number;
  /** nivelIdx con mayor volumen total (POC de la vela) */
  pocNivel: number;
  /** mayor (bid+ask) de un nivel en la vela (para escalar barras) */
  maxCelda: number;
}

/** Tick automático (~1% del precio) escalado por un factor del usuario. */
export function tickAuto(precio: number, escala = 1): number {
  if (!isFinite(precio) || precio <= 0) return 1;
  const base = Math.pow(10, Math.floor(Math.log10(precio)) - 2);
  const t = base * escala;
  return t > 0 ? t : base;
}

/** Tope de velas retenidas (solo se dibujan las visibles). */
const MAX_VELAS_FP = 2000;

export class AgregadorFootprint {
  private readonly paso: number;
  private readonly escala: number;
  /** Tamaño de nivel de precio; se fija con el primer trade */
  private tick = 0;
  private mapa = new Map<number, VelaFP>();
  private orden: number[] = [];

  constructor(pasoSegundos: number, escala: number) {
    this.paso = pasoSegundos;
    this.escala = escala;
  }

  private tiempoVela(tsMs: number): number {
    const s = Math.floor(tsMs / 1000);
    return Math.floor(s / this.paso) * this.paso;
  }

  /** Incorpora un trade a (vela, nivel de precio). */
  agregar(t: AggTrade): void {
    if (this.tick === 0) this.tick = tickAuto(t.price, this.escala);
    const time = this.tiempoVela(t.time);
    let v = this.mapa.get(time);
    if (!v) {
      v = { time, niveles: new Map(), totalBid: 0, totalAsk: 0, pocNivel: 0, maxCelda: 0 };
      this.mapa.set(time, v);
      this.orden.push(time);
      // acotar memoria en sesiones largas (solo se dibujan las velas visibles)
      if (this.orden.length > MAX_VELAS_FP) {
        const viejo = this.orden.shift();
        if (viejo !== undefined) this.mapa.delete(viejo);
      }
    }
    const idx = Math.floor(t.price / this.tick);
    let c = v.niveles.get(idx);
    if (!c) {
      c = { bid: 0, ask: 0 };
      v.niveles.set(idx, c);
    }
    if (t.buyerMaker) {
      c.bid += t.qty;
      v.totalBid += t.qty;
    } else {
      c.ask += t.qty;
      v.totalAsk += t.qty;
    }
    const tot = c.bid + c.ask;
    if (tot > v.maxCelda) {
      v.maxCelda = tot;
      v.pocNivel = idx;
    }
  }

  /** Tamaño de nivel actual (0 hasta el primer trade). */
  tickActual(): number {
    return this.tick;
  }

  velaDe(time: number): VelaFP | undefined {
    return this.mapa.get(time);
  }
}
