// ==================== FUNCIONES PESTAÑA LISTADO ====================

// Generar el listado de trabajos
function generarListado() {
    if (!listadoContainer) return;
    
    if (trabajos.length === 0) {
        listadoContainer.innerHTML = '<p class="empty-message">Carga un archivo Excel para ver el listado de trabajos</p>';
        return;
    }
    
    // Obtener fechas del filtro del listado
    const fechaInicioListado = listadoFechaInicio ? listadoFechaInicio.value : fechaInicio.value;
    const fechaFinListado = listadoFechaFin ? listadoFechaFin.value : fechaFin.value;
    
    // Mapeo de tipos a nombres de departamento
    const DEPARTAMENTO_LABELS = {
        'MTO_ELECTRICO': 'Mto. Eléctrico',
        'MTO_MECANICO': 'Mto. Mecánico',
        'GE': 'GE',
        'MTO_IC': 'Mto. I&C',
        'OTROS': 'Otros'
    };
    
    // Filtrar trabajos asignados al calendario que estén en el rango de fechas y cumplan filtro de tipo
    let trabajosFiltrados = [];
    
    trabajosConFechas.forEach((indices, fecha) => {
        // Filtrar por rango de fechas del listado
        if (fecha < fechaInicioListado || fecha > fechaFinListado) return;
        
        indices.forEach(indice => {
            const trabajo = trabajos[indice];
            if (!trabajo) return;
            
            // Aplicar filtro de tipo de mantenimiento
            if (!filtroTipos.has('TODOS') && !filtroTipos.has(trabajo.tipoMantenimiento)) {
                return;
            }
            
            // Obtener hora directamente (usar ?? para no perder 0:00:00)
            const horaRaw = horasTrabajos.has(indice) ? horasTrabajos.get(indice) : trabajo['Hora inicio validez'];
            const hora = normalizarHora(horaRaw);
            
            trabajosFiltrados.push({
                indice: indice,
                fecha: fecha,
                hora: hora,
                trabajo: trabajo
            });
        });
    });
    
    // Ordenar por fecha y luego por hora
    trabajosFiltrados.sort((a, b) => {
        // Primero por fecha
        if (a.fecha < b.fecha) return -1;
        if (a.fecha > b.fecha) return 1;
        // Luego por hora
        if (a.hora < b.hora) return -1;
        if (a.hora > b.hora) return 1;
        return 0;
    });
    
    if (trabajosFiltrados.length === 0) {
        listadoContainer.innerHTML = '<p class="empty-message">No hay trabajos en el rango de fechas seleccionado</p>';
        return;
    }
    
    // Agrupar por fecha
    const trabajosPorFecha = new Map();
    trabajosFiltrados.forEach(item => {
        if (!trabajosPorFecha.has(item.fecha)) {
            trabajosPorFecha.set(item.fecha, []);
        }
        trabajosPorFecha.get(item.fecha).push(item);
    });
    
    // Generar HTML
    let html = '';
    
    // Nombres de días y meses en español
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    
    trabajosPorFecha.forEach((items, fecha) => {
        // Crear separador de fecha
        const [year, month, day] = fecha.split('-').map(Number);
        const fechaObj = new Date(year, month - 1, day);
        const diaSemana = diasSemana[fechaObj.getDay()];
        const nombreMes = meses[fechaObj.getMonth()];
        
        const claseHoy = (fecha === hoyStr) ? ' fecha-hoy' : '';
        html += `<div class="fecha-separator${claseHoy}" data-fecha="${fecha}">${diaSemana} ${day} de ${nombreMes} ${year}</div>`;
        
        // Crear tabla para los trabajos de este día
        html += '<table class="listado-table">';
        html += '<thead><tr>';
        html += '<th style="width: 60px;">Hora</th>';
        html += '<th style="width: 150px;">Departamento</th>';
        html += '<th style="width: 100px;">Orden</th>';
        html += '<th style="width: 100px;">Solicitud</th>';
        html += '<th style="width: 120px;">CyMP</th>';
        html += '<th>Texto breve</th>';
        html += '<th style="width: 655px;">Aislamientos</th>';
        html += '<th style="width: 80px; text-align: center;">Descargo</th>';
        html += '<th style="width: 80px; text-align: center;">Estado</th>';
        html += '</tr></thead>';
        html += '<tbody>';
        
        items.forEach(item => {
            const trabajo = item.trabajo;
            const indice = item.indice;
            
            // Obtener datos
            const hora = item.hora;
            const tipoMto = trabajo.tipoMantenimiento || 'OTROS';
            const departamentoLabel = DEPARTAMENTO_LABELS[tipoMto] || 'Otros';
            const claseTipo = trabajo.claseTipo || 'tipo-otros';
            const orden = trabajo['Orden'] || '';
            const solicitud = trabajo['Solicitud'] || '';
            let textoBreve = trabajo['Texto breve'] || '';
            //textoBreve = textoBreve.replace(/^HGPIe:\s*/i, '');
            
            // Estado del permiso
            const estadoPermiso = estadosPermisos.get(indice) || 'PENDIENTE';
            let claseEstado = 'pendiente';
            let iconoEstado = '⏳';
            if (estadoPermiso === 'AUTORIZADO') {
                claseEstado = 'autorizado';
                iconoEstado = '✓';
            } else if (estadoPermiso === 'APROBADO') {
                claseEstado = 'aprobado';
                iconoEstado = '🟧';
            }
            
            // Icono de descargo (aislamiento)
            const requiereDescargo = trabajo.requiereDescargo === true;
            const iconoDescargo = requiereDescargo ? '<span class="descargo-badge" title="Requiere acciones de aislamiento">🔒</span>' : '';
            
            html += '<tr>';
            html += `<td>${hora}</td>`;
            html += `<td><span class="departamento-badge ${claseTipo}">${departamentoLabel}</span></td>`;
            // Calcular CyMP para este trabajo
            const cympArrRow = calcularCyMPParaTrabajo(indice);
            const cympRow = (cympArrRow && cympArrRow.length > 0) ? cympArrRow.join(', ') : '';
            html += `<td>${orden}</td>`;
            html += `<td>${solicitud}</td>`;
            html += `<td>${cympRow}</td>`;
            html += `<td>${textoBreve}</td>`;
            // Mostrar aislamientos asociados a la solicitud
            const solicitudKey = (trabajo['Solicitud'] || '').toString().trim();
            const aislamientos = aislamientosPorSolicitud.get(solicitudKey) || [];
            let aislamientosHtml = '';
            if (aislamientos.length === 0) {
                aislamientosHtml = '<span class="aislamiento-vacio">—</span>';
            } else {
                aislamientosHtml = aislamientos.map(a => `<div><b>${a.numero}</b>: ${a.descripcion} <br><small>${a.estados}</small></div>`).join('<hr style="border:none;border-top:1px solid #eee;margin:4px 0;">');
            }
            html += `<td>${aislamientosHtml}</td>`;
            html += `<td style="text-align: center;">${iconoDescargo}</td>`;
            html += `<td style="text-align: center;"><span class="estado-check ${claseEstado}">${iconoEstado}</span></td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table>';
    });
    
    listadoContainer.innerHTML = html;
    // Desplazar a la fecha actual en el listado
    setTimeout(desplazarListadoAHoy, 50);
}

// Desplazar el listado al separador del día actual
function desplazarListadoAHoy() {
    if (!listadoContainer) return;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const separador = listadoContainer.querySelector(`.fecha-separator[data-fecha="${hoyStr}"]`);
    if (!separador) return;

    const zoomStr = getComputedStyle(document.documentElement).getPropertyValue('--app-zoom');
    const zoom = Number.parseFloat(zoomStr) || 1;
    const escala = zoom > 0 ? zoom : 1;

    const contRect = listadoContainer.getBoundingClientRect();
    const sepRect = separador.getBoundingClientRect();
    const th = listadoContainer.querySelector('.listado-table th');
    const alturaCabecera = th ? th.getBoundingClientRect().height / escala : 0;
    const margenSeguridad = 8;

    const offsetTop = (sepRect.top - contRect.top) / escala;
    const targetTop = listadoContainer.scrollTop + offsetTop - alturaCabecera - margenSeguridad;

    listadoContainer.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth'
    });
}

// Imprimir el listado
function imprimirListado() {
    // Asegurarse de que la pestaña listado esté activa antes de imprimir
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const listadoTabBtn = document.querySelector('.tab-button[data-tab="listado"]');
    const listadoTab = document.getElementById('listadoTab');
    
    if (listadoTabBtn) listadoTabBtn.classList.add('active');
    if (listadoTab) listadoTab.classList.add('active');
    
    // Generar el listado actualizado
    generarListado();
    
    // Pequeño delay para asegurar que el DOM se actualice
    setTimeout(() => {
        window.print();
    }, 100);
}

