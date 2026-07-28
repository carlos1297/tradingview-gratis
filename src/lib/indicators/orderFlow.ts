import type { AggTrade } from "@/lib/binance/ws";

/**
 * Una barra de Order Flow alineada a la vela: volumen agresor comprador/vendedor
 * y su delta (buy − sell), en unidades del activo base.
 */
export interface BarraOF {
  time: number; // apertura de la vela (unix segundos)
  buy: number;
  sell: number;
  delta: number;
}

/** Lectura instantánea de la vela en curso + CVD acumulado. */
export interface LecturaOF {
  time: number;
  buy: number;
  sell: number;
  delta: number;
  /** Cumulative Volume Delta hasta la vela en curso (desde que se activó) */
  cvd: number;
  /** Proporción compradora de la vela en curso (0..1); 0.5 sin trades */
  ratioCompra: number;
  /** Trades procesados en total */
  trades: number;
}

/**
 * Agrega los aggTrades de Binance en barras alineadas a la vela y mantiene el
 * CVD (Cumulative Volume Delta). Solo métricas exactas derivadas del flag `m`
 * (buyer-is-maker) de cada trade: sin heurísticas de spoofing/iceberg. Es en
 * vivo — acumula desde que se activa (no hay delta histórico exacto sin bajar
 * todos los trades del par), por eso el CVD arranca en 0 en el borde derecho.
 */
/** Tope de barras retenidas (solo importan la barra actual + cvdPrevio). */
const MAX_BARRAS_OF = 5000;

export class AgregadorOrderFlow {
  private readonly paso: number;
  private barras: BarraOF[] = [];
  /** CVD de todas las barras salvo la actual (para no re-sumar en cada trade) */
  private cvdPrevio = 0;
  private totalTrades = 0;

  constructor(pasoSegundos: number) {
    this.paso = pasoSegundos;
  }

  private tiempoVela(tsMs: number): number {
    const s = Math.floor(tsMs / 1000);
    return Math.floor(s / this.paso) * this.paso;
  }

  /** Incorpora un trade a la barra que le corresponde por tiempo. */
  agregar(t: AggTrade): void {
    const time = this.tiempoVela(t.time);
    let barra = this.barras[this.barras.length - 1];
    if (!barra || time > barra.time) {
      // se cerró la barra anterior: su delta pasa al acumulado previo
      if (barra) this.cvdPrevio += barra.delta;
      barra = { time, buy: 0, sell: 0, delta: 0 };
      this.barras.push(barra);
      // acotar memoria en sesiones largas: la barra descartada ya está sumada
      // en cvdPrevio, así que lectura().cvd sigue siendo correcto.
      if (this.barras.length > MAX_BARRAS_OF) this.barras.shift();
    } else if (time < barra.time) {
      return; // trade fuera de orden (más viejo): se ignora
    }
    // m = comprador es maker → el agresor es vendedor → venta
    if (t.buyerMaker) barra.sell += t.qty;
    else barra.buy += t.qty;
    barra.delta = barra.buy - barra.sell;
    this.totalTrades++;
  }

  /** Estado de la vela en curso + CVD actual (update incremental y readout). */
  lectura(): LecturaOF | null {
    const barra = this.barras[this.barras.length - 1];
    if (!barra) return null;
    const totalVela = barra.buy + barra.sell;
    return {
      time: barra.time,
      buy: barra.buy,
      sell: barra.sell,
      delta: barra.delta,
      cvd: this.cvdPrevio + barra.delta,
      ratioCompra: totalVela > 0 ? barra.buy / totalVela : 0.5,
      trades: this.totalTrades,
    };
  }
}
