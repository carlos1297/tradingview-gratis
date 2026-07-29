# Contrato de integración · Modelo de IA ↔ TradingView-clon

> **Versión del contrato: 1**
> Este documento es autosuficiente: alcanza para integrar un modelo nuevo sin
> leer el código del visor.

Un motor externo (SAC, PPO, DQN, un ensemble…) publica **un solo objeto JSON**
con su estado completo. El visor lo lee, lo normaliza y lo muestra en la barra
de modelos, en el gráfico y en el Probador de estrategias.

Índice:

1. [Principio: hechos, no lecturas](#1-principio-hechos-no-lecturas)
2. [Los dos transportes](#2-los-dos-transportes)
3. [El objeto de estado, campo por campo](#3-el-objeto-de-estado-campo-por-campo)
4. [Las señales de trading](#4-las-señales-de-trading)
5. [Frecuencia y flujo en tiempo real](#5-frecuencia-y-flujo-en-tiempo-real)
6. [Errores y pérdida de comunicación](#6-errores-y-pérdida-de-comunicación)
7. [Compatibilidad y versionado](#7-compatibilidad-y-versionado)
8. [Checklist y validación](#8-checklist-y-validación)

---

## 1. Principio: hechos, no lecturas

**Publicá hechos. El visor calcula las lecturas.**

No mandes PnL en porcentaje, riesgo/recompensa, duración de la operación,
win rate ni señal de compra/venta: el visor los deriva. Si los mandaras, habría
dos fuentes para el mismo número y tarde o temprano se contradicen.

| Publicá esto | El visor te da esto gratis |
|---|---|
| `precioEntrada`, `nocional`, `precio` | PnL flotante en USD y en % |
| `stopLoss`, `takeProfit` | Riesgo/recompensa y distancia a cada barrera |
| `accion`, `zonaMuerta` | Señal `COMPRAR` / `VENDER` / `MANTENER` / `CERRAR` y % de confianza |
| `aperturaMs` | Cronómetro de la operación y hora de apertura |
| `actualizadoMs` | Semáforo `EN VIVO` / `ATRASADO` / `DETENIDO` |
| `saldo`, `equity`, `capitalInicial` | PnL realizado, PnL total y % sobre el capital |
| `senales[]` | Win rate, profit factor, drawdown, curva de equity, lista de trades |

---

## 2. Los dos transportes

### 2.1 Archivo (recomendado)

El motor escribe un JSON en la carpeta `public/` del visor. Es el más simple:
sin servidor, sin red, sin que el motor sepa que el visor existe.

- **Ruta**: `public/estado_<tu_modelo>.json` — el id del modelo en el nombre,
  porque en `public/` conviven los archivos de todos los motores. SAC usa
  `public/estado_sac.json`.
- **URL que ve el visor**: `/estado_<tu_modelo>.json`.
- **El visor sondea** cada `msSondeo` (**5000 ms** por defecto).
- **Cada escritura contiene el estado COMPLETO**, no un delta.

> ⚠️ **La escritura tiene que ser atómica.** Escribí en un temporal y renombrá.
> Si el visor lee el archivo a mitad de escritura obtiene un JSON inválido; no
> se rompe nada (lo descarta y reintenta), pero el panel parpadea.
>
> ```python
> tmp = destino + ".tmp"
> with open(tmp, "w") as f:
>     f.write(json.dumps(estado))
> os.replace(tmp, destino)   # atómico en el mismo sistema de archivos
> ```

### 2.2 WebSocket

El motor expone un `ws://host:puerto/ws` y **empuja** un mensaje por tick.

- Cada mensaje lleva `"tipo": "estado"`. Los que no lo lleven se ignoran.
- **Los eventos son incrementales**: mandá en `eventos` solo los nuevos de ese
  tick; el visor los acumula.
- Para cerrar el episodio: `{"tipo": "fin"}`.
- Para rechazar una conexión: `{"tipo": "error", "mensaje": "..."}` — se registra
  en la consola del navegador.
- El visor **reconecta solo** con backoff exponencial (1 s → 10 s).

### 2.3 Comparación

| | Archivo | WebSocket |
|---|---|---|
| Estado por mensaje | Completo | Completo, con `eventos` incrementales |
| Latencia | Hasta `msSondeo` | Inmediata |
| Complejidad del motor | Escribir un archivo | Servidor WS |
| Sobrevive a que el visor no esté | Sí | Sí (reconecta) |
| Marca de tiempo para el semáforo | `actualizadoMs` del motor | La hora de recepción |
| Recomendado para | Motores por cierre de vela (≥ 1 min) | Motores de alta frecuencia o replay |

---

## 3. El objeto de estado, campo por campo

### 3.0 Dos clases de estado

Un motor publica dos cosas distintas por el mismo canal:

| Clase | Cuándo | Qué lleva |
|---|---|---|
| **Ciclo de vida** | Al arrancar, al fallar, al terminar | `estado`, `mensaje`, `dineroReal`, `actualizadoMs`. Nada más. |
| **Tick de operación** | En cada decisión (`estado: "operando"`) | El objeto completo de las tablas siguientes. |

```json
{"estado": "arrancando", "mensaje": "cargando modelo y datos",
 "dineroReal": false, "actualizadoMs": 1785258000000}

{"estado": "error", "mensaje": "timeout de Binance",
 "dineroReal": false, "actualizadoMs": 1785258300000}

{"estado": "detenido", "mensaje": "motor detenido por el usuario",
 "dineroReal": false, "actualizadoMs": 1785258531125}
```

Los tres campos que **siempre** viajan, en cualquiera de las dos clases, son
`estado`, `dineroReal` y `actualizadoMs`.

> **Recomendación:** incluí también `contrato`, `modeloId` y `modelo` en los
> estados de ciclo de vida. El visor no los necesita (cae a la identidad del
> registro), pero así el archivo se explica solo cuando lo abrís a mano.

Leyenda de la columna **Req.**, referida a un **tick de operación**:

- **⬤ Obligatorio** — sin esto el panel no sirve.
- **◐ Recomendado** — sin esto el visor funciona pero pierde métricas.
- **○ Opcional** — si falta, la celda muestra `—`.

**Ningún campo puede ser `undefined` ni faltar y valer basura.** Si no tenés un
dato, mandá `null` o simplemente no incluyas la clave: el visor completa con
`null`. Nunca mandes `0` para decir "no sé".

### 3.1 Identidad y versión

| Campo | Tipo | Req. | Significado |
|---|---|---|---|
| `contrato` | `number` | ⬤ | Versión del contrato. Hoy: `1`. Sin él se asume `0` (legado). |
| `modeloId` | `string` | ⬤ | Id estable y único: `"sac"`, `"ppo"`. Debe coincidir con el `id` del registro. |
| `modelo` | `string` | ◐ | Nombre visible: `"SAC"`. Alias aceptado: `modeloEtiqueta`. Sin él manda la etiqueta del registro. |
| `checkpoint` | `string` | ○ | Qué pesos está usando: `"mejor"`, `"paso_300000"`. |
| `dineroReal` | `boolean` | ⬤ | `false` = paper trading. Con `false` el visor muestra el cartel **DINERO FALSO**. |

### 3.2 Estado del motor

| Campo | Tipo | Req. | Significado |
|---|---|---|---|
| `estado` | `"arrancando" \| "operando" \| "detenido" \| "error"` | ⬤ | Cualquier otro valor se lee como `"error"`. |
| `mensaje` | `string \| null` | ○ | Detalle del error o nota. Se muestra en el tooltip y, si hay error, en la barra. |
| `actualizadoMs` | `number` | ⬤ | Epoch en **milisegundos** de esta escritura. Es lo que alimenta el semáforo de frescura. Si falta, el visor asume "ahora" y el semáforo deja de ser fiable. |

### 3.3 Mercado

| Campo | Tipo | Req. | Significado |
|---|---|---|---|
| `simbolo` | `string` | ⬤ | Par operado: `"BTCUSDT"`. Se normaliza a mayúsculas. Si no coincide con el del gráfico, la barra ofrece cambiar y las marcas no se dibujan (correcto: son de otro mercado). |
| `precio` | `number \| null` | ⬤ | Último precio que vio el motor. |
| `ultimaVelaMs` | `number \| null` | ◐ | Apertura de la última vela procesada, epoch ms. |
| `enVivo` | `boolean` | ◐ | `true` (default) = reloj de pared. **`false` = replay histórico**: el visor ignora el precio en vivo de Binance y usa el tuyo, y cronometra la operación con `ultimaVelaMs`. Sin esto, un replay muestra PnL y duraciones disparatados. |

### 3.4 Cuenta

| Campo | Tipo | Req. | Significado |
|---|---|---|---|
| `capitalInicial` | `number \| null` | ◐ | Capital con el que arrancó la corrida. Necesario para el PnL total en %. |
| `saldo` | `number \| null` | ◐ | Billetera: incluye el PnL realizado, **no** el flotante. |
| `equity` | `number \| null` | ◐ | `saldo` + PnL flotante. |
| `comisiones` | `number \| null` | ○ | Comisiones acumuladas de la corrida. |
| `funding` | `number \| null` | ○ | Funding acumulado (perpetuos). |
| `operaciones` | `number` | ◐ | Operaciones **cerradas** de la corrida. Sin él se cuentan los cierres de `senales`. |

> El PnL realizado se calcula como `saldo − capitalInicial` cuando los dos están
> presentes (así incluye comisiones y funding); si no, se suma el PnL de los
> cierres de `senales`.

### 3.5 Posición abierta

**Regla: si `posicion` es `"FLAT"`, el visor anula todos estos campos**, aunque
mandes valores viejos. No hace falta que los limpies, pero es más prolijo.

| Campo | Tipo | Req. | Significado |
|---|---|---|---|
| `posicion` | `"LONG" \| "SHORT" \| "FLAT"` | ⬤ | Lado vigente. Cualquier otro valor se lee como `"FLAT"`. |
| `precioEntrada` | `number \| null` | ⬤ (si hay posición) | Precio de apertura, con slippage. **Sin esto el gráfico no dibuja la operación.** |
| `aperturaMs` | `number \| null` | ◐ | Epoch ms de la apertura. Si falta, se deduce de la última apertura sin cierre en `senales`. |
| `nocional` | `number \| null` | ◐ | Exposición en USD = margen × apalancamiento. Sin él no hay PnL flotante en dinero (solo en %, o `equity − saldo` si están). |
| `apalancamiento` | `number \| null` | ○ | Se muestra junto al tamaño: `93 USD · 10x`. |
| `stopLoss` | `number \| null` | ○ | Precio absoluto del stop. Se dibuja en el gráfico. |
| `takeProfit` | `number \| null` | ○ | Precio absoluto del objetivo. Se dibuja en el gráfico. |
| `precioLiquidacion` | `number \| null` | ○ | Precio de liquidación. Con apalancamiento es el dato que de verdad limita la operación. |

### 3.6 Decisión del agente

| Campo | Tipo | Req. | Significado |
|---|---|---|---|
| `accion` | `number \| null` | ◐ | Acción continua en `[-1, 1]`: **el signo es la dirección y `\|accion\|` la convicción**. Un modelo discreto publica `-1`, `0` o `1`. |
| `zonaMuerta` | `number` | ◐ | Umbral por debajo del cual el motor se queda plano. Default `0.1`. Con `accion` y `zonaMuerta` el visor deriva la señal operativa. |
| `regimen` | `string \| null` | ○ | Régimen percibido: `"alcista"`, `"lateral"`… En `snake_case` se muestra legible. |
| `motivoRiesgo` | `string \| null` | ○ | Por qué el motor de riesgo vetó o recortó la decisión: `"veto_colchon_liquidacion"`. `null` = no intervino. Explica los ticks en que el modelo pide operar y no pasa nada. |

Cómo se deriva la señal (idéntico a lo que ejecuta el motor):

```
|accion| < zonaMuerta  →  hay posición ? CERRAR : MANTENER
accion > 0             →  ya está LONG  ? MANTENER : COMPRAR
accion < 0             →  ya está SHORT ? MANTENER : VENDER
```

### 3.7 Señales

| Campo | Tipo | Req. | Significado |
|---|---|---|---|
| `senales` | `Senal[]` | ◐ | **Archivo**: la lista completa acumulada. **WebSocket**: usá `eventos` con solo los nuevos del tick. Ver la sección siguiente. |

---

## 4. Las señales de trading

Cada apertura y cada cierre es un objeto. Alimentan las flechas del gráfico y
**todas** las estadísticas del Probador de estrategias.

| Campo | Tipo | Req. | Significado |
|---|---|---|---|
| `tiempoMs` | `number` | ⬤ | Epoch en **milisegundos**, UTC. (En segundos, las marcas caen en 1970.) |
| `evento` | `"abrir_long" \| "abrir_short" \| "cerrar_long" \| "cerrar_short"` | ⬤ | Vocabulario cerrado. Cualquier otro valor descarta la señal. |
| `precio` | `number` | ⬤ | Precio de ejecución, con slippage. |
| `motivo` | `string` | ○ (cierres) | `"stop_loss"`, `"take_profit"`, `"liquidacion"`, `"senal"`, `"fin_episodio"`. Otros valores se muestran tal cual. |
| `pnlUsd` | `number` | ◐ (cierres) | Resultado **neto** de la operación en USD. **Sin esto el win rate y el profit factor salen en cero.** |

Reglas:

- **Orden cronológico.** El visor empareja recorriendo en secuencia: cada
  `abrir_*` con el `cerrar_*` siguiente.
- **Emparejadas.** Un cierre sin apertura previa se descarta.
- **La última apertura sin cierre es la operación viva.** No inventes un cierre.
- **Solo los cierres cuentan.** La operación abierta se muestra en su propia
  franja, fuera de las estadísticas: su resultado todavía no existe.
- **Las señales inválidas se descartan una por una**, sin tirar el resto: un
  `tiempoMs` que no es número, un evento mal escrito o un `null` en la lista no
  rompen nada.

Ejemplo de una operación completa:

```json
[
  {"tiempoMs": 1785247200000, "evento": "abrir_short", "precio": 63066.28},
  {"tiempoMs": 1785253500000, "evento": "cerrar_short", "precio": 64025.08,
   "motivo": "stop_loss", "pnlUsd": -1.5948},
  {"tiempoMs": 1785253500000, "evento": "abrir_short", "precio": 63828.33}
]
```

→ 1 operación cerrada (perdedora, por stop) + 1 abierta en curso.

---

## 5. Frecuencia y flujo en tiempo real

### 5.1 Cadencia

| Ritmo del motor | `msSondeo` | `msFresco` |
|---|---|---|
| Cierre de vela 5 m (SAC, PPO) | `5000` (default) | `360000` (default) |
| Cierre de vela 1 m | `2000` | `90000` |
| Cierre de vela 1 h | `30000` | `3900000` |
| Sub-segundo | usá WebSocket | `10000` |

Los dos se declaran **por fuente**, al registrar el modelo (ver
[INTEGRAR_MODELO.md](INTEGRAR_MODELO.md)). No hay una constante global.

### 5.2 Ciclo recomendado del motor

```
al arrancar   → escribir {estado:"arrancando", mensaje:"cargando modelo", dineroReal:false}
por cada tick → decidir → escribir el estado COMPLETO
si algo falla → escribir {estado:"error", mensaje:"<detalle corto>"} y SEGUIR
al terminar   → escribir {estado:"detenido"}
```

Escribí el estado **en cada tick, aunque no cambie nada**: `actualizadoMs` es lo
que le dice al visor que seguís vivo.

### 5.3 Semáforo de frescura

El visor **no confía en el campo `estado`** para juzgar si el motor vive: si el
proceso muere, el archivo queda congelado diciendo `"operando"`. Manda el
desfase contra `actualizadoMs`:

| Desfase | Semáforo |
|---|---|
| ≤ `msFresco` | 🟢 **EN VIVO** |
| > `msFresco` | 🟡 **ATRASADO** |
| > `msFresco × 2` | ⚪ **DETENIDO** |
| `estado: "error"` | 🔴 **ERROR** (manda sobre todo lo demás) |
| `estado: "arrancando"` | 🟡 **ARRANCANDO** |

---

## 6. Errores y pérdida de comunicación

Qué hace el visor en cada escenario. **Ninguno afecta a los otros modelos.**

| Situación | Comportamiento |
|---|---|
| El archivo **nunca existió** (404 desde el arranque) | El modelo no aparece en el selector. Es lo normal si ese motor no se lanzó. |
| El archivo **existía y desaparece** (404) | El modelo se quita del selector; si era el activo, el foco pasa a otro. |
| **JSON inválido** o a medio escribir | Se descarta ese tick y se reintenta al siguiente. El panel mantiene el último estado bueno. |
| **JSON válido pero no es un objeto** (array, número, `null`) | Se descarta. No se crea un modelo fantasma. |
| **Campos faltantes** | Se completan con `null`; las celdas muestran `—`. |
| **Campos con tipo equivocado** | Se tratan como ausentes (`null`). |
| **Señales corruptas** | Se descartan una por una; las válidas se conservan. |
| **El adaptador lanza una excepción** | Se registra en consola y se pierde ese tick. La interfaz sigue. |
| **El motor muere** | A los `msFresco` → ATRASADO; al doble → DETENIDO. El archivo se queda con el último estado. |
| **WebSocket cae** | Reconexión automática con backoff 1 s → 10 s, indefinidamente. |
| **WebSocket rechaza la conexión** | Aviso en consola con el `mensaje` del servidor; sigue reintentando. |
| **Dos modelos con el mismo `modeloId`** | El segundo pisa al primero en el store. **Los ids tienen que ser únicos.** |

Corolario para el que integra: **no necesitás manejar errores del lado del
visor.** Escribí tu estado y, si algo falla, escribí `estado: "error"` con un
mensaje corto y seguí corriendo.

---

## 7. Compatibilidad y versionado

- **v1** — el contrato de este documento.
- **v0** — legado: sin `contrato`, sin posición detallada (`nocional`,
  `stopLoss`, `takeProfit`, `aperturaMs`) y sin `zonaMuerta`. **Sigue
  funcionando**: el visor completa con `null`, deduce `aperturaMs` de las
  señales y usa `0.1` de zona muerta.

Compromiso hacia adelante: **subir la versión del contrato nunca rompe un motor
viejo.** Los campos nuevos siempre son opcionales y con default. Un motor que
publique v1 hoy va a seguir funcionando con visores futuros.

La constante `CONTRATO_ACTUAL` está en `src/lib/modelos/nucleo/tipos.ts` y el motor SAC
la refleja en `CONTRATO_ESTADO` (`modelo_SAC/operar_vivo.py`).

---

## 8. Checklist y validación

Antes de dar por integrado un modelo:

- [ ] `contrato: 1` y `modeloId` único, igual al `id` del registro
- [ ] `actualizadoMs` en **milisegundos**, actualizado en cada tick
- [ ] `estado` es uno de los cuatro valores permitidos
- [ ] `simbolo` en mayúsculas
- [ ] `dineroReal: false` si es paper trading
- [ ] Con posición: `precioEntrada` y `nocional` presentes
- [ ] `posicion: "FLAT"` cuando no hay posición
- [ ] `accion` en `[-1, 1]` con el signo correcto, y `zonaMuerta` publicada
- [ ] `senales` en orden cronológico, con `pnlUsd` en cada cierre
- [ ] `tiempoMs` de las señales en **milisegundos**
- [ ] Escritura **atómica** (transporte de archivo)
- [ ] `enVivo: false` si es replay histórico
- [ ] El motor escribe `estado: "error"` en vez de morir

Validación automática contra el JSON Schema:

```bash
# Python
pip install jsonschema
python -c "
import json, jsonschema
esquema = json.load(open('docs/contrato/estado_vivo.schema.json'))
estado  = json.load(open('public/estado_sac.json'))
jsonschema.validate(estado, esquema)
print('✅ el estado cumple el contrato v1')
"
```

El schema distingue las dos clases de estado de la sección 3.0: exige el objeto
completo solo cuando `estado` es `"operando"`, y `precioEntrada` solo cuando hay
posición abierta. Rechaza los errores típicos: `tiempoMs` en segundos, eventos
fuera del vocabulario, cierres sin `pnlUsd`, `accion` fuera de `[-1, 1]`.

Ejemplo completo y real (lo que publica el motor SAC):

```json
{
  "contrato": 1,
  "modeloId": "sac",
  "modelo": "SAC",
  "estado": "operando",
  "simbolo": "BTCUSDT",
  "posicion": "SHORT",
  "precio": 64015.9,
  "equity": 498.09,
  "saldo": 498.37,
  "capitalInicial": 500.0,
  "accion": -0.2016,
  "operaciones": 1,
  "ultimaVelaMs": 1785258000000,
  "precioEntrada": 63828.33,
  "aperturaMs": 1785253800000,
  "nocional": 93.81,
  "stopLoss": 64785.76,
  "takeProfit": 61913.48,
  "apalancamiento": 10,
  "zonaMuerta": 0.1,
  "comisiones": 0.12,
  "funding": -0.0001,
  "checkpoint": "mejor",
  "dineroReal": false,
  "actualizadoMs": 1785258008703,
  "senales": [
    {"tiempoMs": 1785247200000, "evento": "abrir_short", "precio": 63066.28},
    {"tiempoMs": 1785253500000, "evento": "cerrar_short", "precio": 64025.08,
     "motivo": "stop_loss", "pnlUsd": -1.5948},
    {"tiempoMs": 1785253500000, "evento": "abrir_short", "precio": 63828.33}
  ]
}
```

---

## Documentos relacionados

- [INTEGRAR_MODELO.md](INTEGRAR_MODELO.md) — guía paso a paso con código listo para copiar
- [ARQUITECTURA.md](ARQUITECTURA.md) — cómo procesa el visor este contrato
- [contrato/estado_vivo.schema.json](contrato/estado_vivo.schema.json) — JSON Schema
