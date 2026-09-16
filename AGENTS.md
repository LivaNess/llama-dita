# Instrucciones para agentes (Antigravity, Claude, el que venga)

Este archivo es la puerta de entrada. Si sos un agente trabajando en este repositorio,
**leé estos documentos antes de tocar una línea**:

| Documento | Qué te dice |
|---|---|
| `CLAUDE.md` | cómo trabajamos: versionado, bloqueos, reglas del proyecto |
| `ESQUELETO.md` | qué es cada parte, dónde vive y con qué se conecta |
| `SYNC.md` | quién está tocando qué en este momento |
| `CAMBIOS.md` | qué se hizo en cada versión y cómo verificarlo |
| `ROADMAP.md` | a dónde va el proyecto, en qué orden y qué decidimos no hacer |
| `areas/` | el análisis a fondo de cada área: qué decidir antes de codear y qué se nos olvida |

## Lo mínimo, sin vueltas

1. **Antes de editar:** `git pull --rebase origin main` y anotá tu bloqueo en `SYNC.md`.
2. **La versión vive solo en `package.json`**, con el esquema `HITO.ÁREA.FOCO`+letra de
   `VERSIONADO.md`. El primer número no se toca sin permiso de Martín o Juan.
3. **Commit:** `[versión] tipo: descripción` (feat, fix, docs, chore, refactor).
   **Sin líneas `Co-Authored-By:` de las IAs** (pedido de Juan, aceptado por Martín el
   16/09/2026): GitHub las toma como colaborador oficial del repositorio, y la lista de
   colaboradores tiene que quedar a nombre de los humanos. El trabajo del agente se registra en
   `CAMBIOS.md` y en el historial de `SYNC.md`, que es donde se lee de verdad quién hizo qué.
4. **Área nueva** (carpeta o archivo con responsabilidad propia): se registra en
   `ESQUELETO.md` con de qué depende y quién depende de ella, en el mismo commit.
5. **Versión publicada:** se registra en `CAMBIOS.md` con qué cambió, por qué, dónde y
   cómo verificarlo.
6. **Antes del push:** `npm run verificar`. Si falla, no está listo.
7. **Publicar una versión de la app** es `npm run build:desktop && npm run deploy:web` y
   después el push. Sin el segundo comando, nadie recibe la actualización.

## Reglas que ya nos costaron caro

- Nunca nombrar otras aplicaciones de chat o voz en el código, la interfaz o los commits.
- Nunca `git push` con `npm run build` roto.
- No crear un segundo cliente de Supabase: cada uno abre una conexión más por usuario.
- No meter JavaScript dentro del HTML de la web: las cabeceras de seguridad lo bloquean.
- La app usa un puerto fijo: no puede haber dos copias abiertas a la vez.

La verificación de los puntos 4, 5 y 6 corre sola en cada push a `main`. Si no cumplís,
el repositorio te lo marca en rojo.
