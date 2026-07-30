/**
 * Punta a punta: WS real del motor PPO → adaptador real → panel real.
 *
 * Necesita un motor escuchando en ws://127.0.0.1:8000/ws. Sin checkpoint:
 *   cd ~/Escritorio/Entrenamiento-de-IA/RL_PPO && python -m modelo_PPO.demo_feed
 *
 * Nota: `.verif/` empieza con punto, así que tsc NO lo type-chequea (los globs
 * de `include` no matchean directorios ocultos). Si se le cambian los imports,
 * hay que correrlo para saber si sigue compilando.
 */
import {
  adaptarFeedWebSocket,
  posicionParaGrafico,
  saludMotor,
  vistaOperacion,
  type EstadoModeloIA,
} from "@/lib/modelos/nucleo";
import { fuentePorId } from "@/lib/modelos/registro";

const fuente = { ...fuentePorId("ppo")!, url: "ws://127.0.0.1:8000/ws" };
console.log(`fuente del registro: id=${fuente.id} transporte=${fuente.transporte}`);

const ws = new WebSocket(fuente.url!);
let previo: EstadoModeloIA | null = null;
let n = 0, conPos = 0, nulos = 0;
const problemas: string[] = [];
let muestra = "";

await new Promise<void>((listo) => {
  ws.onmessage = (m) => {
    const crudo = JSON.parse(String(m.data));
    if (crudo.tipo !== "estado") return;
    n++;
    const e = adaptarFeedWebSocket(crudo, fuente, previo);
    if (!e) { nulos++; return; }
    previo = e;

    for (const [k, v] of Object.entries(e))
      if (v === undefined) problemas.push(`campo ${k} === undefined`);
    if (!["LONG", "SHORT", "FLAT"].includes(e.posicion))
      problemas.push(`posicion inválida: ${e.posicion}`);
    if (saludMotor(e, Date.now()) !== "operando")
      problemas.push(`salud=${saludMotor(e, Date.now())} (el semáforo debería estar EN VIVO)`);

    const v = vistaOperacion(e, null, Date.now());
    if (e.posicion !== "FLAT") {
      conPos++;
      if (!posicionParaGrafico(e)) problemas.push("con posición pero el gráfico no la dibuja");
      if (v.pnlNoRealizadoUsd === null) problemas.push("PnL en USD nulo con posición abierta");
      if (!muestra) {
        const f = (x: number | null, d = 2) => (x === null ? "—" : x.toFixed(d));
        muestra = [
          `  modelo ......... ${e.modeloEtiqueta} (${e.modeloId})  contrato v${e.contrato}`,
          `  checkpoint ..... ${e.checkpoint}   dineroReal=${e.dineroReal}  enVivo=${e.enVivo}`,
          `  posición ....... ${e.posicion}  entrada ${f(v.precioEntrada)}  nocional ${f(v.nocional, 0)} USD ${e.apalancamiento}x`,
          `  PnL ............ ${f(v.pnlNoRealizadoUsd)} USD (${f(v.pnlNoRealizadoPct)}%)`,
          `  SL / TP ........ ${f(v.stopLoss)} / ${f(v.takeProfit)}   R:R 1:${f(v.riesgoRecompensa)}`,
          `  liquidación .... ${f(e.precioLiquidacion)}  (${f(v.distanciaLiquidacionPct)}%)`,
          `  equity ......... ${f(e.equity)}  saldo ${f(e.saldo)}  capital ${f(e.capitalInicial)}`,
          `  señal / acción . ${v.senal}  accion=${f(e.accion, 3)}  zonaMuerta=${e.zonaMuerta}`,
          `  régimen ........ ${e.regimen}   riesgo=${e.motivoRiesgo ?? "sin veto"}`,
          `  operaciones .... ${e.operaciones}  comisiones ${f(e.comisiones)}  señales ${e.senales.length}`,
        ].join("\n");
      }
    }
    if (n >= 250) { ws.close(); listo(); }
  };
  ws.onerror = () => { problemas.push("error de WebSocket"); listo(); };
  ws.onclose = () => listo();
  setTimeout(() => { try { ws.close(); } catch {} listo(); }, 25000);
});

console.log(`\nticks=${n}  conPosición=${conPos}  adaptadorNull=${nulos}  señales=${previo?.senales.length ?? 0}`);
console.log("\n── panel con posición abierta (datos reales del motor) ──");
console.log(muestra || "  (la corrida no abrió posición)");
console.log("\n" + (problemas.length
  ? `❌ ${problemas.length} problemas:\n  ` + [...new Set(problemas)].slice(0, 8).join("\n  ")
  : "✅ integración punta a punta correcta con el adaptador GENÉRICO del registro"));
