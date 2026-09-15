# Versionado · Llama-dita

> **No es semver.** Es un rastreador de *en qué se está laburando*, pensado para trazabilidad: poder retroceder y aislar errores ("¿qué cambió en la 1.2.3B?"). Es el mismo esquema que usamos en todos nuestros proyectos.
> El número vive en **un solo lugar**: `package.json` → `version`. Todo lo demás se sincroniza solo (ver abajo).

---

## El esquema: `HITO.ÁREA.FOCO` + letra de intento · ej. `1.3.1A`

Cuatro piezas: tres números y una letra → `H.A.F` + `letra`.

| Pieza | Qué significa | Cuándo sube | Efecto |
|---|---|---|---|
| **1º — Hito (H)** | Un **cambio groso** del proyecto (marca un antes y un después). | ⚠️ **Solo con permiso de Martín o Juan.** Un agente puede *sugerirlo*, nunca subirlo por su cuenta. | +1 · resetea Área y Foco a 1 y la letra a A |
| **2º — Área (A)** | El **área de trabajo** en la que se está ahora. Ej: cuentas, actualizaciones, audio. | Cuando **cambiás de área**. | +1 · resetea Foco a 1 y la letra a A |
| **3º — Foco (F)** | La **cosa puntual** dentro del área. Ej: dentro de cuentas, las llamadas directas. | Cuando **cambiás de foco** dentro de la misma área. | +1 · resetea la letra a A |
| **Letra — Intento** | El **intento** (commit / arreglo) sobre el mismo foco. | En **cada commit** sobre el mismo foco. | A→B→C… (después de Z sigue AA) |

**Importante:** el número **no es un mapa fijo**. Es un registro **cronológico**, no una tabla de equivalencias: si hoy "audio" es área `4` y en un mes volvés a audio, podés estar en `7`. Los números solo dicen *"cambié de hito / área / foco"*, no *"esta área siempre es la N"*. Qué significa cada número se lee en el historial de `SYNC.md`.

### Ejemplo de cómo evoluciona
```
1.3.1A   estás en un foco, primer intento
1.3.1B   segundo intento sobre lo mismo (un fix)
1.3.1C   tercer intento
1.3.2A   misma área, cambiás de foco   → la letra vuelve a A
1.4.1A   cambiás de área               → foco vuelve a 1, letra a A
2.1.1A   hito groso (CON permiso)      → todo se resetea, sube el hito
```

---

## Cómo se actualiza (HACERLO SIEMPRE)

1. Antes de commitear, decidí qué subió: ¿mismo foco? → letra. ¿Otro foco? → foco. ¿Otra área? → área.
2. Cambiá `version` en **`package.json`** y nada más a mano.
3. El commit lleva la versión adelante: `[1.3.1B] fix: descripción corta`.
4. Agregá la fila en el historial de `SYNC.md` (versión, agente, qué se hizo).

### Qué se sincroniza solo
- La UI lee la versión de `package.json` en el build (`__APP_VERSION__`) y la muestra en el tag del header. **No editar el tag a mano** en `index.html`.
- `npm run build:desktop` copia la versión a `desktop/neutralino.config.json` e `installer.iss`, copia `dist/` a `desktop/resources/` y escribe `desktop/update-manifest.json`.
- El actualizador de la app compara la versión publicada con la instalada: **si son distintas, hay actualización**. Por eso no hace falta que el número sea "mayor".

---

## Dónde estamos

| Versión | Qué es |
|---|---|
| `1.1.1A` | Base de Juan: llamada de voz P2P, señalización por Supabase Realtime + TURN, cliente Windows. (Asignado retroactivamente; los esquemas anteriores `X.Y.Z.L` y SemVer `1.0.1` quedan obsoletos.) |
| `1.2.1A` | Cuentas, amigos, canales y llamadas directas (Supabase Auth + tablas con RLS). |
| `1.3.1A` | Actualizaciones automáticas opcionales + botón de buscar actualizaciones. |
| `1.3.1B` | El aviso muestra la versión instalada; primera actualización publicada para probar el updater. |
| `1.4.1A` | Onboarding: al abrir sin sesión se abre solo "Creá tu cuenta". |
| `1.5.1A` | Fix updater (caché + permiso de escritura) y micrófono sin volver a pedir permiso. **← actual** |
