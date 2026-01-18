Aplicación web estática para planificar trabajos de parada GADEA: carga permisos desde Excel, distribuye trabajos en calendario/listado, y gestiona aislamientos.

Funcionalidades clave:
- Carga de Excel de permisos (SheetJS), validación básica de columnas y normalización de fechas/horas.
- Calendario con drag & drop para asignar trabajos a días, estadísticas por día y globales.
- Listado imprimible con filtros de fecha, departamento y estado.
- Aislamientos desde TXT, vínculo por número de Solicitud y vista agrupada.
- Filtros por texto y por tipo de mantenimiento (según “Creado por”).
- Indicadores: estado del permiso, descargo (Utilización=YU1), enlaces a Fiori (orden/solicitud) y botones “Crear Aviso / Permiso”.
- Copiado rápido de Orden/Solicitud/Texto breve y modal de detalles con CyMP y aislamientos.
- Exportación a Excel con columnas añadidas (fecha actualizada, estado, descargo, aislamientos).
- Sincronización con Supabase (subir/leer último backup) y auto-carga al iniciar si hay credenciales.

Estructura de ficheros:
- `index.html`: layout, tabs y botones.
- `styles.css`: estilos y layout.
- `app.core.js`: estado global, mapeos y helpers.
- `app.excel.js`: lectura/parseo de Excel.
- `app.calendario.js`: render del calendario, filtros y modales.
- `app.listado.js`: vista de listado e impresión.
- `app.aislamientos.js`: parseo y asignación de aislamientos TXT.
- `app.dragdrop.js`: drag & drop, export y Supabase.
- `app.init.js`: listeners y arranque.
- `mto-config.js`: mapeo “Creado por” → departamento/clase.
- `config.js`: credenciales Supabase.

Datos y “base de datos”:
- Fuente principal: Excel de permisos (columnas esperadas como `Orden`, `Solicitud`, `Texto breve`, `Válido de`, `Hora inicio validez`, `Utilización`, etc.).
- Aislamientos: fichero TXT con estructura jerárquica; se vinculan por número de Solicitud.
- Supabase: tabla `backup_excel` guarda payload `data` (rows) y opcional `aislamientos`; se lee el último registro por `created_at`.
