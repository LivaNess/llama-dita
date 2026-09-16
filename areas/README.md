# Fichas de área

Seis análisis hechos en paralelo el 16/09/2026, uno por área, **antes** de construir. Cada uno
responde lo mismo: qué entra y qué no en esa área, en qué orden se construye y por qué, qué
decisiones hay que tomar **antes** de escribir código, qué se nos está olvidando, cómo se
conecta con los presets, cómo se prueba, y qué cosas NO van ahí para que no se llene de parches.

**Empezá por [`00-SINTESIS.md`](00-SINTESIS.md)**: es la reconciliación de las seis. Ahí están
la contradicción que quedó abierta, las tres coincidencias, los bugs que salieron (varios ya
arreglados) y lo que queda por decidir.

| Ficha | De qué se ocupa |
|---|---|
| [`00-SINTESIS.md`](00-SINTESIS.md) | **leer primero**: dónde se contradicen, dónde coinciden, qué queda decidido |
| [`consumo-medidor-y-presets.md`](consumo-medidor-y-presets.md) | el medidor de consumo y los cuatro perfiles |
| [`voz-y-repartidor.md`](voz-y-repartidor.md) | de la llamada de hoy a los canales con varios |
| [`pantalla-y-camara.md`](pantalla-y-camara.md) | compartir pantalla y cámara sin robar cuadros |
| [`chat-e-historial.md`](chat-e-historial.md) | mensajes, imágenes, buscador y borrar de verdad |
| [`espacios-canales-y-roles.md`](espacios-canales-y-roles.md) | permisos, invitaciones y moderación |
| [`escritorio-y-ayudante-nativo.md`](escritorio-y-ayudante-nativo.md) | atajos globales, métricas, instalador |

Son análisis, no órdenes: lo que digan se discute. Varias de sus conclusiones ya se aplicaron
(ver `CAMBIOS.md` de la `0.17.1A` en adelante) y otras están esperando decisión en la síntesis.

El relevamiento de lo que hacen las otras aplicaciones vive **fuera del repositorio**, por la
regla de no nombrarlas acá. Está en la máquina de Martín, en `llama-dita-notas/`.
