/** Verifica la cadena real: ticks del motor Python → adaptador → derivaciones. */
import { readFileSync } from "node:fs";
import { adaptarFeedWebSocket, adaptarContratoEstandar } from "@/lib/modelos/adaptadores";
import { vistaOperacion, posicionParaGrafico, saludMotor } from "@/lib/modelos/derivar";
import type { EstadoModeloIA, FuenteModelo } from "@/lib/modelos/tipos";

const ticks = JSON.parse(readFileSync(process.argv[2], "utf8")) as unknown[];
const fuente = { id: "ppo", etiqueta: "PPO", descripcion: "", color: "#ab47bc",
  transporte: "websocket", url: "ws://x", adaptar: adaptarFeedWebSocket } as FuenteModelo;

let previo: EstadoModeloIA | null = null;
const fallos: string[] = [];
let conPos = 0, vistaConPos: ReturnType<typeof vistaOperacion> | null = null;
let estadoConPos: EstadoModeloIA | null = null;

// Precio en vivo FALSO y disparatado: si se cuela, el PnL explota.
const PRECIO_VIVO_FALSO = 110_000;

for (const t of ticks) {
  const e = adaptarFeedWebSocket(t, fuente, previo);
  if (!e) { fallos.push("adaptador devolvió null"); continue; }
  previo = e;

  for (const [k, v] of Object.entries(e)) {
    if (v === undefined) fallos.push(`campo ${k} === undefined (el contrato prohíbe undefined)`);
  }
  const vista = vistaOperacion(e, PRECIO_VIVO_FALSO, Date.now());
  if (e.posicion !== "FLAT") {
    conPos++;
    vistaConPos ??= vista; estadoConPos ??= e;
    if (vista.precioActual === PRECIO_VIVO_FALSO)
      fallos.push("se coló el precio EN VIVO en un motor de replay");
    if (e.aperturaMs === null || !Number.isFinite(e.aperturaMs))
      fallos.push(`aperturaMs inválido: ${e.aperturaMs}`);
    if (vista.duracionMs !== null && !Number.isFinite(vista.duracionMs))
      fallos.push(`duracionMs NaN`);
    const p = posicionParaGrafico(e);
    if (!p) fallos.push("posicionParaGrafico devolvió null con posición abierta");
    else if (p.precioReferencia !== e.precio)
      fallos.push(`precioReferencia ${p.precioReferencia} != precio del motor ${e.precio}`);
  }
  for (const s of e.senales)
    if (!Number.isFinite(s.tiempoMs)) fallos.push(`señal sin tiempoMs: ${JSON.stringify(s)}`);
}

console.log(`ticks=${ticks.length}  conPosicion=${conPos}  señales=${previo!.senales.length}`);
console.log(`salud=${saludMotor(previo!, Date.now())}  enVivo=${previo!.enVivo}  contrato=${previo!.contrato}`);
console.log("\n── panel con posición abierta ──");
const e = estadoConPos!, v = vistaConPos!;
const f = (x: number | null, d = 2) => (x === null ? "—" : x.toFixed(d));
console.log(`  Entrada ......... ${f(v.precioEntrada)}`);
console.log(`  Precio actual ... ${f(v.precioActual)}  (vivo falso ${PRECIO_VIVO_FALSO} IGNORADO)`);
console.log(`  PnL no realiz. .. ${f(v.pnlNoRealizadoUsd)} USD  (${f(v.pnlNoRealizadoPct)}%)`);
console.log(`  Tamaño .......... ${f(v.nocional, 0)} USD  ${e.apalancamiento}x`);
console.log(`  Tiempo abierta .. ${f(v.duracionMs, 0)} ms`);
console.log(`  Stop loss ....... ${f(v.stopLoss)}  (${f(v.distanciaStopPct)}%)`);
console.log(`  Take profit ..... ${f(v.takeProfit)}  (${f(v.distanciaTakePct)}%)`);
console.log(`  Liquidación ..... ${f(e.precioLiquidacion)}  (${f(v.distanciaLiquidacionPct)}%)`);
console.log(`  R/R ............. 1 : ${f(v.riesgoRecompensa)}`);
console.log(`  Confianza ....... ${(v.confianza * 100).toFixed(0)}%  accion=${f(e.accion, 3)}`);
console.log(`  PnL realizado ... ${f(v.pnlRealizadoUsd)}`);
console.log(`  Equity .......... ${f(e.equity)}  (${f(v.pnlTotalPct)}%)`);
console.log(`  Operaciones ..... ${e.operaciones}  com. ${f(e.comisiones)}`);
console.log(`  Régimen ......... ${e.regimen ?? "—"}`);
console.log(`  Risk Engine ..... ${e.motivoRiesgo ?? "sin veto"}`);
console.log(`  Señal ........... ${v.senal}`);

// No regresión de SAC: el JSON legado v0 sigue dando lo mismo que antes.
const sac = adaptarContratoEstandar(
  { modelo: "SAC", estado: "operando", simbolo: "BTCUSDT", precio: 60000, equity: 1000,
    posicion: "LONG", precioEntrada: 59000,
    senales: [{ tiempoMs: 1700000000000, evento: "abrir_long", precio: 59000 }] },
  { ...fuente, id: "sac", etiqueta: "SAC", adaptar: adaptarContratoEstandar },
);
const vSac = vistaOperacion(sac!, PRECIO_VIVO_FALSO, Date.now());
console.log(`\n── SAC (v0, motor en vivo) ──`);
console.log(`  enVivo=${sac!.enVivo}  regimen=${sac!.regimen}  motivoRiesgo=${sac!.motivoRiesgo}`);
console.log(`  precioActual=${vSac.precioActual} (usa el tick vivo, como siempre) ` +
            `${vSac.precioActual === PRECIO_VIVO_FALSO ? "✅" : "❌ REGRESIÓN"}`);
console.log(`  aperturaMs=${sac!.aperturaMs} (deducido de señales) ` +
            `${sac!.aperturaMs === 1700000000000 ? "✅" : "❌"}`);

console.log("\n" + (fallos.length
  ? `❌ ${fallos.length} FALLOS:\n` + [...new Set(fallos)].slice(0, 8).join("\n")
  : "✅ cadena Python → adaptador → panel → gráfico coherente"));
