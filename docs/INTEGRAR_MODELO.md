# Integrar un modelo de IA nuevo

> Guía práctica. El formato exacto de cada campo está en
> [CONTRATO_MODELOS.md](CONTRATO_MODELOS.md); acá va el paso a paso con código
> listo para copiar.

**Tiempo estimado: 15 minutos.** No hay que tocar ningún componente del visor.

---

## Elegí tu camino

| | Camino A · sin código | Camino B · en el registro |
|---|---|---|
| Cuándo | Tu motor publica el contrato v1 | Querés que venga de fábrica, o tu motor tiene formato propio |
| Qué tocás | Una variable de entorno | Un archivo del visor |
| Requiere recompilar | No | Sí |

Los dos terminan igual: tu modelo aparece en el selector, con su barra de
métricas, su posición dibujada en el gráfico y sus estadísticas en el Probador.

---

## Paso 1 — Que el motor publique su estado

### Opción archivo (recomendada)

```python
import json, os, time

# El visor sirve `public/` como raíz web: este archivo se ve en /estado_dqn.json
DESTINO = "/ruta/a/tradingview-clon/public/estado_dqn.json"

def publicar(**campos):
    """Escritura ATÓMICA: el visor nunca lee un JSON a medias."""
    campos["actualizadoMs"] = int(time.time() * 1000)
    tmp = DESTINO + ".tmp"
    with open(tmp, "w") as f:
        f.write(json.dumps(campos))
    os.replace(tmp, DESTINO)      # atómico dentro del mismo sistema de archivos


# ── al arrancar ──────────────────────────────────────────────────────────
publicar(contrato=1, modeloId="dqn", modelo="DQN",
         estado="arrancando", mensaje="cargando modelo", dineroReal=False)

senales = []          # se acumulan durante toda la corrida

# ── en cada decisión ─────────────────────────────────────────────────────
while True:
    try:
        accion, sim, precio, velaMs = decidir()     # tu lógica

        # registrar aperturas y cierres cuando ocurren
        # senales.append({"tiempoMs": velaMs, "evento": "abrir_long",
        #                 "precio": precioEntrada})
        # senales.append({"tiempoMs": velaMs, "evento": "cerrar_long",
        #                 "precio": precioSalida, "motivo": "take_profit",
        #                 "pnlUsd": 12.34})

        publicar(
            contrato=1, modeloId="dqn", modelo="DQN",
            estado="operando", dineroReal=False,
            simbolo="BTCUSDT", precio=precio, ultimaVelaMs=velaMs,
            # cuenta
            capitalInicial=500.0, saldo=round(sim.saldo, 2),
            equity=round(sim.equity(precio), 2), operaciones=sim.nOperaciones,
            comisiones=round(sim.comisiones, 2), funding=round(sim.funding, 4),
            # posición (todo None si está plano)
            posicion={1: "LONG", -1: "SHORT", 0: "FLAT"}[sim.direccion],
            precioEntrada=round(sim.precioEntrada, 2) if sim.direccion else None,
            aperturaMs=sim.aperturaMs,
            nocional=round(sim.nocional, 2) if sim.direccion else None,
            apalancamiento=10,
            stopLoss=sim.stopLoss, takeProfit=sim.takeProfit,
            # decisión
            accion=round(accion, 4), zonaMuerta=0.1,
            # señales
            senales=senales,
        )
    except Exception as e:
        # NUNCA morir por un fallo puntual: publicar el error y seguir
        publicar(estado="error", mensaje=str(e)[:200], dineroReal=False)

    time.sleep(300)     # tu cadencia
```

Referencia real y completa: `modelo_SAC/operar_vivo.py` en el repo de RL_SAC.

### Opción WebSocket

Mismo objeto, con tres diferencias:

1. Agregá `"tipo": "estado"`.
2. Usá `eventos` (solo los **nuevos** de este tick) en vez de `senales`.
3. Al terminar mandá `{"tipo": "fin"}`.

```python
# FastAPI
@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    async for paso in correr_modelo():
        await sock.send_json({
            "tipo": "estado", "contrato": 1,
            "modeloId": "dqn", "modeloEtiqueta": "DQN",
            "estado": "operando", "dineroReal": False,
            "simbolo": "BTCUSDT", "precio": paso.precio,
            # La PALABRA, no el entero interno del simulador. El visor acepta
            # las dos formas por compatibilidad, pero el contrato es esta.
            "posicion": {1: "LONG", -1: "SHORT", 0: "FLAT"}[paso.direccion],
            "equity": paso.equity, "saldo": paso.saldo, "capitalInicial": 500.0,
            "precioEntrada": paso.precioEntrada, "nocional": paso.nocional,
            "stopLoss": paso.stopLoss, "takeProfit": paso.takeProfit,
            "accion": paso.accion, "zonaMuerta": 0.1,
            # Publicalo igual aunque por WebSocket el visor use la hora de
            # recepción (§2.3): así el mismo objeto vale para los dos
            # transportes y valida contra el schema sin cambios.
            "actualizadoMs": int(time.time() * 1000),
            "enVivo": False,                   # ⚠️ replay histórico
            "eventos": paso.eventos_nuevos,    # solo los de este tick
        })
    await sock.send_json({"tipo": "fin"})
```

> **Si reproducís datos históricos, `enVivo: False` no es opcional.** Sin eso el
> visor compara tu precio de entrada de hace dos años contra el BTC de hoy y
> muestra un PnL de cientos de por ciento que no existe.

---

## Paso 2 — Registrar el modelo en el visor

### Camino A · sin tocar código

En `.env.local` del visor, todo en **una línea**:

```bash
NEXT_PUBLIC_MODELOS_EXTRA=[{"id":"dqn","etiqueta":"DQN","url":"/estado_dqn.json"}]
```

Campos aceptados:

| Campo | Req. | Default |
|---|---|---|
| `id` | ⬤ | — (debe coincidir con tu `modeloId` y ser único) |
| `url` | ⬤ | — (`/archivo.json` o `ws://host:puerto/ws`) |
| `etiqueta` | ○ | el `id` en mayúsculas |
| `descripcion` | ○ | texto genérico (tooltip del selector) |
| `color` | ○ | `#26a69a` |
| `transporte` | ○ | `archivo` (o `websocket`) |
| `msSondeo` | ○ | `5000` |
| `msFresco` | ○ | `360000` |

Varios modelos a la vez:

```bash
NEXT_PUBLIC_MODELOS_EXTRA=[{"id":"dqn","etiqueta":"DQN","url":"/estado_dqn.json"},{"id":"a2c","etiqueta":"A2C","transporte":"websocket","url":"ws://127.0.0.1:8010/ws","color":"#ffa726","msFresco":60000}]
```

Un JSON con un typo, una entrada sin `url` o un `id` repetido se descartan con
un aviso en consola: **nunca dejan el visor en blanco**.

### Camino B · en el registro

En `src/lib/modelos/registro.ts`, dentro de `MODELOS_INTEGRADOS`:

```ts
{
  id: "dqn",
  etiqueta: "DQN",
  descripcion: "Deep Q-Network · acciones discretas",
  color: "#26a69a",
  transporte: "archivo",
  url: "/estado_dqn.json",
  adaptar: adaptarContratoEstandar,
  // opcional, si tu cadencia no es la de una vela de 5 m:
  // msSondeo: 2000,
  // msFresco: 90_000,
}
```

Eso es **todo**. No se tocan la barra, el gráfico, el store ni el Probador.

---

## Paso 3 — Verificar

```bash
# 1. el motor está escribiendo, y con marca de tiempo fresca
cat public/estado_dqn.json | python -m json.tool | head -20

# 2. el estado cumple el contrato
python -c "
import json, jsonschema
jsonschema.validate(json.load(open('public/estado_dqn.json')),
                    json.load(open('docs/contrato/estado_vivo.schema.json')))
print('✅ contrato v1 OK')"

# 3. el visor lo sirve
curl -s localhost:3000/estado_dqn.json | head -c 200

# 4. nada se rompió
bun run verificar     # tsc + eslint + 86 tests
```

En la pantalla deberías ver:

- Una pestaña **DQN** en el selector de la barra de modelos (con dos o más
  modelos aparecen las pestañas; con uno solo, la etiqueta fija).
- El semáforo en 🟢 **EN VIVO**.
- La operación abierta dibujada sobre las velas, con su entrada, SL y TP.
- El **Probador de estrategias** (botón del header o tecla `P`) con la franja de
  la operación abierta y, en cuanto cierres una, las estadísticas.

---

## Casos especiales

### Mi modelo no tiene stop loss ni take profit

Mandá `null`. Las celdas muestran `—` y el gráfico dibuja solo la entrada.
Nada más cambia.

### Mi modelo usa acciones discretas (comprar / vender / mantener)

Publicá `accion` como `1`, `-1` o `0`, y `zonaMuerta: 0.5`. El visor deriva la
señal igual que con una acción continua.

### Mi modelo opera otro par

Publicá tu `simbolo`. La barra avisa que el modelo opera otro mercado y ofrece
cambiar el gráfico con un clic. Mientras tanto tus marcas y tu posición no se
dibujan — es lo correcto: los precios son de otro mercado.

### Mi motor publica un formato que no puedo cambiar

Escribí un adaptador en `src/lib/modelos/adaptadores.ts`:

```ts
export function adaptarMiFormato(
  crudo: unknown,
  fuente: FuenteModelo,
  previo: EstadoModeloIA | null,
): EstadoModeloIA | null {
  // traducí tu JSON a EstadoModeloIA; `null` donde no tengas el dato
}
```

y usalo en la entrada del registro. Es la **única** pieza del visor que conoce
formatos concretos.

### Necesito otro transporte (SSE, long-poll, postMessage…)

1. Creá `src/lib/modelos/transportes/<tuTransporte>.ts` exportando un `Conector`:

   ```ts
   export const conectarSSE: Conector = ({ url, onDatos, onAviso }) => {
     const es = new EventSource(url);
     es.onmessage = (m) => { try { onDatos(JSON.parse(m.data)); } catch {} };
     es.onerror = () => onAviso?.("SSE caído, el navegador reintenta solo");
     return () => es.close();
   };
   ```

2. Sumalo al objeto `TRANSPORTES` de `transportes/index.ts`.

El tipo `Transporte` se deriva de esas claves, así que a partir de ahí el
registro ya lo acepta y TypeScript verifica el resto. **El núcleo no cambia.**

---

## Errores frecuentes

| Síntoma | Causa |
|---|---|
| El modelo no aparece | El archivo no existe en `public/`, o la `url` del registro no coincide |
| Aparece en ⚪ **DETENIDO** | `actualizadoMs` falta, está en segundos, o el motor dejó de escribir |
| Las marcas caen en 1970 | `tiempoMs` de las señales en segundos, no en milisegundos |
| Win rate y profit factor en cero | Falta `pnlUsd` en los cierres |
| El gráfico no dibuja la posición | Falta `precioEntrada`, o el `simbolo` no es el del gráfico |
| PnL flotante en `—` | Falta `nocional` (y también `equity`/`saldo`) |
| PnL de cientos de por ciento | Motor en replay sin `enVivo: false` |
| El panel parpadea | Escritura no atómica: escribí en `.tmp` y renombrá |
| El modelo pisa a otro | Dos fuentes con el mismo `id` |
| La celda de señal dice siempre MANTENER | Falta `accion`, o `zonaMuerta` es demasiado grande |

---

## Documentos relacionados

- [CONTRATO_MODELOS.md](CONTRATO_MODELOS.md) — formato JSON campo por campo
- [ARQUITECTURA.md](ARQUITECTURA.md) — cómo procesa el visor lo que publicás
- [contrato/estado_vivo.schema.json](contrato/estado_vivo.schema.json) — JSON Schema
