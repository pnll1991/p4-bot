# P4 Bot

Bots persistentes de código abierto: cada bot con su propia computadora, credenciales, memoria y rutinas, con aprobaciones que siempre podés ver.

> **Fork no oficial.** P4 Bot es un fork no oficial basado en el código fuente de T3 Code
> (github.com/pingdotgg/t3code). No está afiliado a T3 Tools, Inc. ni está respaldado ni mantenido
> por ellos. "T3 Code", "T3 Connect" y sus logos son marcas de T3 Tools, Inc.; ver
> [TRADEMARK.md](./TRADEMARK.md).

## Estado

Etapa temprana. Hoy es T3 Code renombrado, con estas diferencias:

- Los threads nuevos arrancan en **Supervisado** (en lugar de Acceso total).
- Los datos se guardan en `~/.p4` (en lugar de `~/.t3`), así que puede convivir con una instalación de T3 Code.

Todavía falta reemplazar los íconos, los nombres de paquetes (`@t3tools/*`, CLI `t3`), los
identificadores de las apps móviles y los servicios atados a T3 (T3 Connect, actualizaciones,
app.t3.codes).

## Desarrollo

Ver [docs/operations/00_development.md](./docs/operations/00_development.md).

## Licencia

MIT para el código fuente; ver [LICENSE](./LICENSE). La nota de copyright original de T3 Tools, Inc.
se conserva.
