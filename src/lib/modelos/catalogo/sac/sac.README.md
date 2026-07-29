# Modelo SAC

Soft Actor-Critic con críticos cuantílicos TQC y encoder Conv1D/GRU multiescala.
Opera BTCUSDT perpetuo en **paper trading** (dinero falso, sin claves de API).

## De dónde salen los datos

| | |
|---|---|
| **Motor** | `modelo_SAC/operar_vivo.py`, en el repo **RL_SAC** (proyecto aparte) |
| **Transporte** | `archivo` — escribe un JSON y el visor lo sondea |
| **Ruta** | `public/estado_sac.json` (respaldo: `public/estado_vivo.json`) |
| **Cadencia** | una decisión por **cierre de vela de 5 m**, +5 s de gracia |
| **Sondeo del visor** | 5 s (default) · **atrasado** a los 6 min, **detenido** a los 12 |

El motor resuelve solo dónde está el visor (`visor.py` de RL_SAC: variable
`VISOR_TRADINGVIEW` o rutas conocidas). Si no lo encuentra, sigue operando y
solo guarda su copia local — publicar es opcional.

## Arrancarlo

```bash
cd /ruta/a/RL_SAC
python ejecutar_visor.py          # levanta el visor Y el motor; Ctrl+C corta los dos
python ejecutar_visor.py --sin-vivo   # solo el backtest sobre el gráfico
```

O el motor a mano:

```bash
cd modelo_SAC && python operar_vivo.py
python operar_vivo.py --una-vez   # una sola decisión, para probar
```

> La barra de modelo aparece con la **primera decisión**, al cierre de la
> próxima vela de 5 m: hasta ~6 minutos de espera. Antes de eso no hay barra, y
> es lo esperado.

## Qué campos del contrato llena

Publica el contrato **v1 completo**, así que las 17 celdas de la barra tienen
valor. Incluye los tres que muchos motores omiten:

- `precioLiquidacion` — con 10× es el precio que de verdad limita la operación
- `motivoRiesgo` — por qué el Risk Engine vetó o recortó la decisión (`null` = no intervino)
- `enVivo: true` — reloj de pared, así el visor refresca el PnL flotante con el
  precio de Binance entre decisiones

**No publica** `regimen`: el modelo no tiene clasificador de régimen, y la celda
muestra `—`.

## Comportamiento ante fallos

Un ciclo que falla (timeout de Binance, por ejemplo) publica
`estado: "error"` **encima del último estado bueno**: la posición abierta, las
señales y la cuenta siguen a la vista mientras dure el problema. Igual al parar
con `Ctrl+C`, que deja registrado dónde quedó la operación.

## Archivos de este modelo

```
sac.fuente.ts                        el alta en el visor (identidad, ruta, cadencia)
sac.README.md                        este archivo
__tests__/sac.integracion.test.ts    contrato ejecutable contra el motor real
__tests__/fixtures/estado_sac_v1.json captura literal de lo que publicó el motor
```

Ni una línea de lógica: SAC usa el adaptador estándar del núcleo
(`nucleo/adaptadores.ts`) porque publica el contrato v1 tal cual.

Para actualizar el fixture tras un cambio deliberado del motor:

```bash
cp public/estado_sac.json src/lib/modelos/catalogo/sac/__tests__/fixtures/estado_sac_v1.json
```

## Ver también

- [`../../../../docs/CONTRATO_MODELOS.md`](../../../../../docs/CONTRATO_MODELOS.md) — el contrato campo por campo
- [`../../../../docs/ARQUITECTURA.md`](../../../../../docs/ARQUITECTURA.md) — cómo procesa el visor este estado
- `modelo_SAC/USO.md` en RL_SAC — operar el motor
