// ============================================================
// app.estadisticas.js - Pestaña de Estadísticas con gráficas
// ============================================================

// Cache de datos históricos para evitar re-consultar Supabase al cambiar filtros
let _estadHistoricoCache = null;
// Instancias de Chart.js para poder destruirlas al re-renderizar
let _chartInstances = {};

// Colores consistentes con el resto de la aplicación
const COLORES_ESTADO = {
    AUTORIZADO: { bg: 'rgba(76, 175, 80, 0.7)', border: '#4CAF50' },
    APROBADO:   { bg: 'rgba(255, 152, 0, 0.7)', border: '#FF9800' },
    FINALIZADO: { bg: 'rgba(66, 66, 66, 0.7)',   border: '#424242' },
    PENDIENTE:  { bg: 'rgba(189, 189, 189, 0.7)', border: '#BDBDBD' },
    GESTIONADOS: { bg: 'rgba(244, 67, 54, 0.7)', border: '#F44336' }
};

const COLORES_DEPARTAMENTO = {
    MTO_ELECTRICO: { bg: 'rgba(33, 150, 243, 0.7)',  border: '#2196F3', label: 'Mto. Eléctrico' },
    MTO_MECANICO:  { bg: 'rgba(76, 175, 80, 0.7)',   border: '#4CAF50', label: 'Mto. Mecánico' },
    GE:            { bg: 'rgba(156, 39, 176, 0.7)',   border: '#9C27B0', label: 'GE' },
    MTO_IC:        { bg: 'rgba(255, 152, 0, 0.7)',    border: '#FF9800', label: 'Mto. I&C' },
    OTROS:         { bg: 'rgba(158, 158, 158, 0.7)',  border: '#9E9E9E', label: 'Otros' }
};

// ============================================================
// Función principal: renderizar estadísticas al activar la pestaña
// ============================================================
async function renderizarEstadisticas() {
    const loading = document.getElementById('estadisticasLoading');
    const graficas = document.getElementById('estadGraficas');
    const sinDatos = document.getElementById('estadSinDatos');

    // Si ya tenemos datos en caché, re-renderizar con filtros actuales
    if (_estadHistoricoCache) {
        sinDatos.style.display = 'none';
        graficas.style.display = 'grid';
        _renderizarGraficas(_estadHistoricoCache);
        return;
    }

    // Si no hay caché, cargar automáticamente
    await _cargarYRenderizar();
}

// ============================================================
// Cargar datos de Supabase y renderizar
// ============================================================
async function _cargarYRenderizar() {
    const loading = document.getElementById('estadisticasLoading');
    const graficas = document.getElementById('estadGraficas');
    const sinDatos = document.getElementById('estadSinDatos');

    if (!supabaseClient) {
        sinDatos.innerHTML = '<p class="empty-message">Supabase no configurado. No se pueden cargar estadísticas.</p>';
        sinDatos.style.display = 'block';
        return;
    }

    // Mostrar loading
    sinDatos.style.display = 'none';
    graficas.style.display = 'none';
    const ganttDiv = document.getElementById('estadGantt');
    if (ganttDiv) ganttDiv.style.display = 'none';
    loading.style.display = 'flex';

    try {
        const datosHistoricos = await _cargarEstadisticasHistoricas();

        if (!datosHistoricos || datosHistoricos.snapshotsPorDia.length === 0) {
            loading.style.display = 'none';
            sinDatos.innerHTML = '<p class="empty-message">No se encontraron datos históricos en la nube.</p>';
            sinDatos.style.display = 'block';
            return;
        }

        _estadHistoricoCache = datosHistoricos;

        // Configurar fechas por defecto en los filtros
        const fechas = datosHistoricos.snapshotsPorDia.map(s => s.fecha);
        const estadFechaDesde = document.getElementById('estadFechaDesde');
        const estadFechaHasta = document.getElementById('estadFechaHasta');
        if (estadFechaDesde && !estadFechaDesde.value) {
            estadFechaDesde.value = fechas[0];
        }
        if (estadFechaHasta && !estadFechaHasta.value) {
            estadFechaHasta.value = fechas[fechas.length - 1];
        }

        loading.style.display = 'none';
        graficas.style.display = 'grid';

        _renderizarGraficas(datosHistoricos);

    } catch (err) {
        console.error('Error cargando estadísticas:', err);
        loading.style.display = 'none';
        sinDatos.innerHTML = `<p class="empty-message">Error al cargar datos: ${err.message}</p>`;
        sinDatos.style.display = 'block';
    }
}

// ============================================================
// Consultar TODOS los registros de backup_excel en Supabase
// ============================================================
async function _cargarEstadisticasHistoricas() {
    // Paginar para obtener todos los registros (Supabase limita a 1000 por consulta)
    let allRecords = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabaseClient
            .from('backup_excel')
            .select('data, created_at')
            .order('created_at', { ascending: true })
            .range(offset, offset + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) {
            hasMore = false;
        } else {
            allRecords = allRecords.concat(data);
            offset += pageSize;
            if (data.length < pageSize) hasMore = false;
        }
    }

    if (allRecords.length === 0) return null;

    // Parsear cada snapshot: extraer rows y el mapa de estados
    const snapshotsParsed = [];
    for (const record of allRecords) {
        let rows = record.data;
        // Normalizar: si es objeto con .rows, extraer
        if (rows && typeof rows === 'object' && !Array.isArray(rows) && rows.rows) {
            rows = rows.rows;
        }
        if (!Array.isArray(rows) || rows.length < 2) continue;

        const headers = rows[0];
        const indiceSolicitud = headers.findIndex(h => h && h.toString().trim() === 'Solicitud');
        const indiceStatus = headers.findIndex(h => h && h.toString().trim() === 'Status de usuario');
        const indiceCreadoPor = headers.findIndex(h => h && h.toString().trim() === 'Creado por');
        const indiceTextoBreve = headers.findIndex(h => h && h.toString().trim() === 'Texto breve');
        const indiceValidoDe = headers.findIndex(h => h && h.toString().trim() === 'Válido de');

        if (indiceSolicitud === -1) continue;

        const fecha = record.created_at.split('T')[0]; // YYYY-MM-DD

        // Extraer un mapa de solicitud -> { status, depto }
        const trabajosMap = new Map();
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const solicitud = String(row[indiceSolicitud] || '').trim();
            if (!solicitud || solicitud.startsWith('4')) continue; // Ignorar CyMPs

            // Determinar estado
            let estado = 'PENDIENTE';
            if (indiceStatus !== -1) {
                const statusRaw = String(row[indiceStatus] || '').trim().toUpperCase();
                if (statusRaw === 'AUTO') estado = 'AUTORIZADO';
                else if (statusRaw === 'APRO') estado = 'APROBADO';
                else if (statusRaw === 'FIN') estado = 'FINALIZADO';
            }

            // Determinar departamento
            let depto = 'OTROS';
            if (indiceCreadoPor !== -1) {
                const creadoPor = String(row[indiceCreadoPor] || '').trim();
                const mapping = (typeof MTO_MAPPING !== 'undefined' && MTO_MAPPING[creadoPor])
                    ? MTO_MAPPING[creadoPor]
                    : (typeof MTO_MAPPING !== 'undefined' ? MTO_MAPPING['DEFAULT'] : { id: 'OTROS' });
                depto = mapping.id;
            }

            // Descripción (Texto breve)
            const descripcion = indiceTextoBreve !== -1 ? String(row[indiceTextoBreve] || '').trim() : '';

            // Fecha de inicio del trabajo (Válido de)
            const validoDeRaw = indiceValidoDe !== -1 ? row[indiceValidoDe] : '';
            const fechaInicio = (typeof normalizarFecha === 'function') ? normalizarFecha(validoDeRaw) : null;

            trabajosMap.set(solicitud, { estado, depto, descripcion, fechaInicio });
        }

        snapshotsParsed.push({ fecha, timestamp: record.created_at, trabajosMap });
    }

    // Agrupar por día: tomar el ÚLTIMO snapshot de cada día
    const porDia = new Map();
    for (const snap of snapshotsParsed) {
        porDia.set(snap.fecha, snap);
    }

    const snapshotsPorDia = Array.from(porDia.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Comparar snapshots consecutivos para detectar transiciones
    const cambiosPorDia = [];
    for (let i = 0; i < snapshotsPorDia.length; i++) {
        const actual = snapshotsPorDia[i];
        const anterior = i > 0 ? snapshotsPorDia[i - 1] : null;

        const cambios = {
            fecha: actual.fecha,
            nuevos: 0,
            nuevosSolicitudes: [],
            aAutorizado: 0,
            aAprobado: 0,
            aFinalizado: 0,
            aPendiente: 0,
            eliminados: 0
        };

        if (anterior) {
            // Detectar transiciones
            for (const [solicitud, datos] of actual.trabajosMap) {
                const anteriorDatos = anterior.trabajosMap.get(solicitud);
                if (!anteriorDatos) {
                    cambios.nuevos++;
                    cambios.nuevosSolicitudes.push(solicitud);
                } else if (anteriorDatos.estado !== datos.estado) {
                    // Cambio de estado
                    if (datos.estado === 'AUTORIZADO') cambios.aAutorizado++;
                    else if (datos.estado === 'APROBADO') cambios.aAprobado++;
                    else if (datos.estado === 'FINALIZADO') cambios.aFinalizado++;
                    else if (datos.estado === 'PENDIENTE') cambios.aPendiente++;
                }
            }
            // Detectar eliminados
            for (const solicitud of anterior.trabajosMap.keys()) {
                if (!actual.trabajosMap.has(solicitud)) {
                    cambios.eliminados++;
                }
            }
        } else {
            // Primer snapshot: no hay anterior con el que comparar, descartar
            continue;
        }

        cambiosPorDia.push(cambios);
    }

    // Construir timeline por solicitud:
    // - inicio: fecha en que se autoriza (primera vez que aparece como AUTORIZADO)
    // - fin: fecha en que pasa a FINALIZADO
    const timelineSolicitudes = new Map();
    for (const snap of snapshotsPorDia) {
        for (const [solicitud, datos] of snap.trabajosMap) {
            if (!timelineSolicitudes.has(solicitud)) {
                timelineSolicitudes.set(solicitud, {
                    inicio: null,
                    fin: null,
                    estado: datos.estado,
                    depto: datos.depto,
                    descripcion: datos.descripcion,
                    fechaInicio: datos.fechaInicio || null
                });
            }
            const tl = timelineSolicitudes.get(solicitud);
            // Actualizar último estado conocido
            tl.estado = datos.estado;
            tl.descripcion = datos.descripcion || tl.descripcion;
            tl.depto = datos.depto;
            if (!tl.fechaInicio && datos.fechaInicio) tl.fechaInicio = datos.fechaInicio;
            // Inicio = primera fecha en que se autoriza
            if (datos.estado === 'AUTORIZADO' && !tl.inicio) {
                tl.inicio = snap.fecha;
            }
            // Fin = primera fecha en que pasa a FINALIZADO
            if (datos.estado === 'FINALIZADO' && !tl.fin) {
                tl.fin = snap.fecha;
            }
            // Registrar última fecha en que aparece
            tl.ultimaAparicion = snap.fecha;
        }
    }
    // Para los que no tienen fin:
    // - Si desaparecen antes del último snapshot => usar última aparición como fin
    // - Si siguen en el último snapshot => usar fecha del último snapshot (aún activos)
    const ultimaFecha = snapshotsPorDia.length > 0 ? snapshotsPorDia[snapshotsPorDia.length - 1].fecha : null;
    for (const [, tl] of timelineSolicitudes) {
        if (!tl.fin) tl.fin = tl.ultimaAparicion || ultimaFecha;
    }

    return { snapshotsPorDia, cambiosPorDia, timelineSolicitudes };
}

// ============================================================
// Obtener filtros actuales
// ============================================================
function _obtenerFiltrosEstad() {
    const fechaDesde = document.getElementById('estadFechaDesde')?.value || '';
    const fechaHasta = document.getElementById('estadFechaHasta')?.value || '';

    // Departamentos seleccionados
    const deptMenu = document.getElementById('estadDeptMenu');
    const deptos = new Set();
    if (deptMenu) {
        deptMenu.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            deptos.add(cb.value);
        });
    }
    if (deptos.size === 0) deptos.add('TODOS');

    return { fechaDesde, fechaHasta, deptos };
}

// ============================================================
// Filtrar datos según departamento y fecha de inicio del trabajo
// ============================================================
function _filtrarSnapshot(trabajosMap, filtros) {
    const { deptos, fechaDesde, fechaHasta } = filtros;
    const filtrarDepto = !deptos.has('TODOS');
    const filtrarFecha = !!(fechaDesde || fechaHasta);

    if (!filtrarDepto && !filtrarFecha) return trabajosMap;

    const filtrado = new Map();
    for (const [sol, datos] of trabajosMap) {
        // Filtro por departamento
        if (filtrarDepto && !deptos.has(datos.depto)) continue;
        // Filtro por fecha de inicio del trabajo (Válido de)
        if (filtrarFecha && datos.fechaInicio) {
            if (fechaDesde && datos.fechaInicio < fechaDesde) continue;
            if (fechaHasta && datos.fechaInicio > fechaHasta) continue;
        }
        filtrado.set(sol, datos);
    }
    return filtrado;
}

// ============================================================
// Renderizar todas las gráficas
// ============================================================
function _renderizarGraficas(datosHistoricos) {
    const { snapshotsPorDia, cambiosPorDia, timelineSolicitudes } = datosHistoricos;
    const filtros = _obtenerFiltrosEstad();

    // Las fechas ahora filtran por "Válido de" del trabajo, no por fecha del snapshot
    // Se pasan todos los snapshots y cambios; el filtro se aplica dentro de cada gráfica

    // Renderizar gráficas
    _renderizarChartEvolucion(snapshotsPorDia, filtros);
    _renderizarChartCambiosDia(cambiosPorDia, filtros, snapshotsPorDia);

    // Renderizar Gantt
    _renderizarChartGantt(timelineSolicitudes, filtros);
}

// ============================================================
// Gráfica 1: Evolución de estados en el tiempo (líneas)
// ============================================================
function _renderizarChartEvolucion(snapshots, filtros) {
    const ctx = document.getElementById('chartEvolucion');
    if (!ctx) return;

    // Destruir instancia previa
    if (_chartInstances.evolucion) _chartInstances.evolucion.destroy();

    const labels = [];
    const dataAuto = [], dataApro = [], dataFin = [], dataPend = [], dataGestionados = [];

    for (const snap of snapshots) {
        labels.push(_formatearFechaCorta(snap.fecha));
        const mapa = _filtrarSnapshot(snap.trabajosMap, filtros);
        let auto = 0, apro = 0, fin = 0, pend = 0;
        for (const [, d] of mapa) {
            if (d.estado === 'AUTORIZADO') auto++;
            else if (d.estado === 'APROBADO') apro++;
            else if (d.estado === 'FINALIZADO') fin++;
            else pend++;
        }
        dataAuto.push(auto);
        dataApro.push(apro);
        dataFin.push(fin);
        dataPend.push(pend);
        dataGestionados.push(auto + fin);
    }

    _chartInstances.evolucion = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Autorizados',
                    data: dataAuto,
                    borderColor: COLORES_ESTADO.AUTORIZADO.border,
                    backgroundColor: COLORES_ESTADO.AUTORIZADO.bg,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3
                },
                {
                    label: 'Aprobados',
                    data: dataApro,
                    borderColor: COLORES_ESTADO.APROBADO.border,
                    backgroundColor: COLORES_ESTADO.APROBADO.bg,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3
                },
                {
                    label: 'Finalizados',
                    data: dataFin,
                    borderColor: COLORES_ESTADO.FINALIZADO.border,
                    backgroundColor: COLORES_ESTADO.FINALIZADO.bg,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3
                },
                {
                    label: 'Gestionados',
                    data: dataGestionados,
                    borderColor: COLORES_ESTADO.GESTIONADOS.border,
                    backgroundColor: COLORES_ESTADO.GESTIONADOS.bg,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3
                },
                {
                    label: 'Pendientes',
                    data: dataPend,
                    borderColor: COLORES_ESTADO.PENDIENTE.border,
                    backgroundColor: COLORES_ESTADO.PENDIENTE.bg,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// ============================================================
// Gráfica 2: Cambios de estado por día (barras apiladas)
// Recalcula cambios aplicando filtros de depto y fecha de inicio
// ============================================================
function _renderizarChartCambiosDia(cambios, filtros, snapshots) {
    const ctx = document.getElementById('chartCambiosDia');
    if (!ctx) return;

    if (_chartInstances.cambiosDia) _chartInstances.cambiosDia.destroy();

    // Construir mapa fecha -> snapshot para acceder a datos de cada solicitud
    const snapPorFecha = new Map();
    if (snapshots) {
        for (const snap of snapshots) snapPorFecha.set(snap.fecha, snap);
    }

    // Recalcular conteos aplicando los mismos filtros que la tabla
    const labels = [];
    const dataNuevos = [], dataAuto = [], dataApro = [], dataFin = [];

    for (const c of cambios) {
        const snap = snapPorFecha.get(c.fecha);
        let nuevos = 0, aAuto = 0, aApro = 0, aFin = 0;

        // Nuevos: filtrar por depto y fechaInicio
        if (c.nuevosSolicitudes && snap) {
            for (const sol of c.nuevosSolicitudes) {
                const datos = snap.trabajosMap.get(sol);
                if (!datos) continue;
                if (!filtros.deptos.has('TODOS') && !filtros.deptos.has(datos.depto)) continue;
                if (datos.fechaInicio) {
                    if (filtros.fechaDesde && datos.fechaInicio < filtros.fechaDesde) continue;
                    if (filtros.fechaHasta && datos.fechaInicio > filtros.fechaHasta) continue;
                }
                nuevos++;
            }
        }

        // Transiciones de estado: necesitamos el snapshot anterior para verificar
        // Recorremos las solicitudes del snapshot actual buscando cambios
        if (snap) {
            // Encontrar snapshot anterior
            const idxSnap = snapshots.indexOf(snap);
            const snapAnterior = idxSnap > 0 ? snapshots[idxSnap - 1] : null;

            if (snapAnterior) {
                for (const [sol, datos] of snap.trabajosMap) {
                    // Aplicar filtros
                    if (!filtros.deptos.has('TODOS') && !filtros.deptos.has(datos.depto)) continue;
                    if (datos.fechaInicio) {
                        if (filtros.fechaDesde && datos.fechaInicio < filtros.fechaDesde) continue;
                        if (filtros.fechaHasta && datos.fechaInicio > filtros.fechaHasta) continue;
                    }
                    const anteriorDatos = snapAnterior.trabajosMap.get(sol);
                    if (anteriorDatos && anteriorDatos.estado !== datos.estado) {
                        if (datos.estado === 'AUTORIZADO') aAuto++;
                        else if (datos.estado === 'APROBADO') aApro++;
                        else if (datos.estado === 'FINALIZADO') aFin++;
                    }
                }
            }
        }

        labels.push(_formatearFechaCorta(c.fecha));
        dataNuevos.push(nuevos);
        dataAuto.push(aAuto);
        dataApro.push(aApro);
        dataFin.push(aFin);
    }

    _chartInstances.cambiosDia = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Nuevos',
                    data: dataNuevos,
                    backgroundColor: 'rgba(33, 150, 243, 0.7)',
                    borderColor: '#2196F3',
                    borderWidth: 1
                },
                {
                    label: 'A Autorizado',
                    data: dataAuto,
                    backgroundColor: COLORES_ESTADO.AUTORIZADO.bg,
                    borderColor: COLORES_ESTADO.AUTORIZADO.border,
                    borderWidth: 1
                },
                {
                    label: 'A Aprobado',
                    data: dataApro,
                    backgroundColor: COLORES_ESTADO.APROBADO.bg,
                    borderColor: COLORES_ESTADO.APROBADO.border,
                    borderWidth: 1
                },
                {
                    label: 'A Finalizado',
                    data: dataFin,
                    backgroundColor: COLORES_ESTADO.FINALIZADO.bg,
                    borderColor: COLORES_ESTADO.FINALIZADO.border,
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// ============================================================
// Gráfica Gantt: Timeline de solicitudes (barras horizontales)
// ============================================================
// Colores de departamento iguales al calendario
const COLORES_DEPTO_CALENDARIO = {
    MTO_ELECTRICO: { bg: '#90caf9', border: '#42a5f5' },
    MTO_MECANICO:  { bg: '#f48fb1', border: '#f06292' },
    GE:            { bg: '#a5d6a7', border: '#81c784' },
    MTO_IC:        { bg: '#ffe082', border: '#ffd54f' },
    OTROS:         { bg: '#eeeeee', border: '#bdbdbd' }
};

function _renderizarChartGantt(timelineSolicitudes, filtros) {
    const container = document.getElementById('estadGantt');
    const ctx = document.getElementById('chartGantt');
    if (!ctx || !container) return;

    if (_chartInstances.gantt) _chartInstances.gantt.destroy();

    // Filtrar solicitudes: solo las autorizadas (con fecha de inicio en el Gantt) y dentro del rango
    const items = [];
    for (const [solicitud, tl] of timelineSolicitudes) {
        // Solo mostrar solicitudes que hayan sido autorizadas (tienen inicio)
        if (!tl.inicio) continue;
        // Filtro por departamento
        if (!filtros.deptos.has('TODOS') && !filtros.deptos.has(tl.depto)) continue;
        // Filtro por fecha de inicio del trabajo (Válido de)
        if (tl.fechaInicio) {
            if (filtros.fechaDesde && tl.fechaInicio < filtros.fechaDesde) continue;
            if (filtros.fechaHasta && tl.fechaInicio > filtros.fechaHasta) continue;
        } else {
            if (filtros.fechaDesde || filtros.fechaHasta) continue;
        }
        items.push({ solicitud, ...tl });
    }

    if (items.length === 0) {
        container.style.display = 'none';
        return;
    }

    // Ordenar por departamento y luego por fecha inicio
    const deptoOrden = { MTO_ELECTRICO: 0, MTO_MECANICO: 1, GE: 2, MTO_IC: 3, OTROS: 4 };
    items.sort((a, b) => {
        const da = deptoOrden[a.depto] ?? 99;
        const db = deptoOrden[b.depto] ?? 99;
        if (da !== db) return da - db;
        return a.inicio.localeCompare(b.inicio);
    });

    // Calcular rango temporal global
    let minFecha = items[0].inicio;
    let maxFecha = items[0].fin || items[0].inicio;
    for (const it of items) {
        if (it.inicio < minFecha) minFecha = it.inicio;
        const f = it.fin || it.inicio;
        if (f > maxFecha) maxFecha = f;
    }

    const toTs = (f) => new Date(f + 'T00:00:00').getTime();

    // Labels: solicitud + descripción corta
    const labels = items.map(it => {
        const desc = it.descripcion ? it.descripcion.substring(0, 40) : '';
        return `${it.solicitud} - ${desc}`;
    });

    // Datos: barras flotantes [inicio, fin]
    const barData = items.map(it => {
        const start = toTs(it.inicio);
        const end = toTs(it.fin || it.inicio) + 86400000;
        return [start, end];
    });

    // Colores según DEPARTAMENTO (mismos colores que el calendario)
    const bgColors = items.map(it => {
        const c = COLORES_DEPTO_CALENDARIO[it.depto] || COLORES_DEPTO_CALENDARIO.OTROS;
        return c.bg;
    });
    const borderColors = items.map(it => {
        const c = COLORES_DEPTO_CALENDARIO[it.depto] || COLORES_DEPTO_CALENDARIO.OTROS;
        return c.border;
    });

    // Ajustar altura del wrapper según número de items
    const wrapperDiv = container.querySelector('.gantt-wrapper');
    const alturaMinima = 300;
    const alturaPorItem = 28;
    const alturaCalculada = Math.max(alturaMinima, items.length * alturaPorItem + 60);
    if (wrapperDiv) wrapperDiv.style.height = alturaCalculada + 'px';

    container.style.display = 'block';

    // Construir etiquetas de leyenda de departamento
    const deptosPresentes = [...new Set(items.map(it => it.depto))];

    _chartInstances.gantt = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Duración',
                data: barData,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderSkipped: false,
                barPercentage: 0.7,
                categoryPercentage: 0.9
            }]
        },
        plugins: [{
            // Plugin para dibujar leyenda de departamentos
            id: 'ganttLegend',
            beforeDraw(chart) {
                const ctx2 = chart.ctx;
                const top = chart.chartArea.top - 20;
                let x = chart.chartArea.left;
                ctx2.save();
                ctx2.font = '11px sans-serif';
                for (const d of deptosPresentes) {
                    const col = COLORES_DEPTO_CALENDARIO[d] || COLORES_DEPTO_CALENDARIO.OTROS;
                    const lbl = COLORES_DEPARTAMENTO[d]?.label || d;
                    ctx2.fillStyle = col.bg;
                    ctx2.strokeStyle = col.border;
                    ctx2.lineWidth = 1;
                    ctx2.fillRect(x, top, 14, 12);
                    ctx2.strokeRect(x, top, 14, 12);
                    ctx2.fillStyle = '#333';
                    ctx2.fillText(lbl, x + 18, top + 10);
                    x += ctx2.measureText(lbl).width + 34;
                }
                ctx2.restore();
            }
        }],
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 25 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const item = items[context.dataIndex];
                            const deptoLabel = COLORES_DEPARTAMENTO[item.depto]?.label || item.depto;
                            const inicio = _formatearFechaCorta(item.inicio);
                            const fin = item.fin ? _formatearFechaCorta(item.fin) : '...';
                            return `${inicio} → ${fin}  |  ${item.estado}  |  ${deptoLabel}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: { day: 'd MMM' },
                        tooltipFormat: 'd MMM yyyy'
                    },
                    min: toTs(minFecha),
                    max: toTs(maxFecha) + 86400000,
                    ticks: { font: { size: 11 } }
                },
                y: {
                    ticks: { font: { size: 10 }, autoSkip: false }
                }
            }
        }
    });
}

// ============================================================
// Utilidades
// ============================================================
function _formatearFechaCorta(fechaStr) {
    // "2026-01-15" -> "15 Ene"
    const partes = fechaStr.split('-');
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const dia = parseInt(partes[2], 10);
    const mes = meses[parseInt(partes[1], 10) - 1] || partes[1];
    return `${dia} ${mes}`;
}

// ============================================================
// Event listeners para filtros de estadísticas
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    // Botón actualizar
    const btnActualizar = document.getElementById('estadActualizarBtn');
    if (btnActualizar) {
        btnActualizar.addEventListener('click', async () => {
            // Forzar re-carga desde Supabase si no hay caché, o re-renderizar con filtros si hay
            if (!_estadHistoricoCache) {
                await _cargarYRenderizar();
            } else {
                const graficas = document.getElementById('estadGraficas');
                const sinDatos = document.getElementById('estadSinDatos');
                sinDatos.style.display = 'none';
                graficas.style.display = 'grid';
                _renderizarGraficas(_estadHistoricoCache);
            }
        });
    }

    // Dropdown departamento para estadísticas
    const estadDeptBtn = document.getElementById('estadDeptBtn');
    const estadDeptMenu = document.getElementById('estadDeptMenu');

    if (estadDeptBtn && estadDeptMenu) {
        estadDeptBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            estadDeptMenu.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!estadDeptBtn.contains(e.target) && !estadDeptMenu.contains(e.target)) {
                estadDeptMenu.classList.remove('show');
            }
        });

        const actualizarTexto = () => {
            const checks = estadDeptMenu.querySelectorAll('input[type="checkbox"]:checked');
            const valores = Array.from(checks).map(c => c.value);
            if (valores.includes('TODOS') || valores.length === 0) {
                estadDeptBtn.textContent = 'Todos los departamentos';
            } else if (valores.length === 1) {
                const label = checks[0].parentElement.textContent.trim();
                estadDeptBtn.textContent = label;
            } else {
                estadDeptBtn.textContent = `${valores.length} departamentos`;
            }
        };

        estadDeptMenu.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const value = e.target.value;
                const checked = e.target.checked;

                if (value === 'TODOS') {
                    if (checked) {
                        estadDeptMenu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                            if (cb.value !== 'TODOS') cb.checked = false;
                        });
                    }
                } else {
                    if (checked) {
                        const todosCb = estadDeptMenu.querySelector('input[value="TODOS"]');
                        if (todosCb) todosCb.checked = false;
                    } else {
                        // Si no queda ninguno marcado, volver a TODOS
                        const alguno = estadDeptMenu.querySelectorAll('input[type="checkbox"]:checked');
                        if (alguno.length === 0) {
                            const todosCb = estadDeptMenu.querySelector('input[value="TODOS"]');
                            if (todosCb) todosCb.checked = true;
                        }
                    }
                }

                actualizarTexto();
            });
        });
    }
});
