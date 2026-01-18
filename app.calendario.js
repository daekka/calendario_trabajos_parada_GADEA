// Generar calendarios basado en las fechas seleccionadas
function generarCalendario() {
    calendarioContainer.innerHTML = '';
    
    // Obtener fechas de los inputs
    const fechaInicioStr = fechaInicio.value;
    const fechaFinStr = fechaFin.value;
    
    if (!fechaInicioStr || !fechaFinStr) {
        // Valores por defecto si no hay fechas
        const enero = generarMesCalendario(2026, 0, 16, 31, true, 0, false, false, true);
        calendarioContainer.appendChild(enero);
        const febrero = generarMesCalendario(2026, 1, 1, 16, false, 1, true, true, false);
        calendarioContainer.appendChild(febrero);
        return;
    }
    
    const inicio = new Date(fechaInicioStr);
    const fin = new Date(fechaFinStr);
    
    if (inicio > fin) {
        alert('La fecha de inicio debe ser anterior a la fecha de fin');
        return;
    }
    
    // Generar calendarios para todos los meses entre inicio y fin
    const meses = [];
    let fechaActual = new Date(inicio);
    
    while (fechaActual <= fin) {
        const ano = fechaActual.getFullYear();
        const mes = fechaActual.getMonth();
        const dia = fechaActual.getDate();
        
        // Determinar el primer y último día del mes a mostrar
        let diaInicio = 1;
        let diaFin = new Date(ano, mes + 1, 0).getDate();
        
        // Si es el mes de inicio, empezar desde el día de inicio
        if (ano === inicio.getFullYear() && mes === inicio.getMonth()) {
            diaInicio = inicio.getDate();
        }
        
        // Si es el mes de fin, terminar en el día de fin
        if (ano === fin.getFullYear() && mes === fin.getMonth()) {
            diaFin = fin.getDate();
        }
        
        meses.push({ ano, mes, diaInicio, diaFin });
        
        // Avanzar al primer día del siguiente mes
        fechaActual = new Date(ano, mes + 1, 1);
    }
    
    // Generar calendarios para cada mes (continuo, sin saltos)
    meses.forEach(({ ano, mes, diaInicio, diaFin }, index) => {
        const esPrimerMes = index === 0;
        const esUltimoMes = index === meses.length - 1;
        const tieneMesAnterior = index > 0;
        const tieneMesSiguiente = index < meses.length - 1;
        const mesCalendario = generarMesCalendario(ano, mes, diaInicio, diaFin, esPrimerMes, index, esUltimoMes, tieneMesAnterior, tieneMesSiguiente);
        calendarioContainer.appendChild(mesCalendario);
    });
    
    // Igualar ancho de todos los días después de renderizar
    setTimeout(igualarAnchoDias, 0);
    // Desplazar a "hoy" para que se vea aunque haya zoom
    setTimeout(desplazarCalendarioAHoy, 150);
}

// Función para igualar el ancho de todos los días del calendario
function igualarAnchoDias() {
    const diasCalendario = document.querySelectorAll('.dia-calendario');
    const diasSemana = document.querySelectorAll('.dia-semana');
    
    if (diasCalendario.length === 0) return;
    
    // Usar ancho fijo de 275px para todos los días (compacto pero legible)
    const anchoFijo = 295;
    
    // Aplicar el ancho fijo a todos los días del calendario
    diasCalendario.forEach(dia => {
        dia.style.minWidth = anchoFijo + 'px';
        dia.style.width = anchoFijo + 'px';
    });
    
    // Aplicar el mismo ancho a los encabezados de días de la semana
    diasSemana.forEach(dia => {
        dia.style.minWidth = anchoFijo + 'px';
        dia.style.width = anchoFijo + 'px';
    });
}

// Desplazar el scroll para centrar el día actual en la vista
function desplazarCalendarioAHoy() {
    const contenedorScroll = document.querySelector('.calendario-section');
    const diaActual = document.querySelector('.dia-calendario.dia-actual');
    if (!contenedorScroll || !diaActual) return;

    const cabeceraDias = contenedorScroll.querySelector('.dias-semana');
    const alturaCabecera = cabeceraDias ? cabeceraDias.getBoundingClientRect().height : 0;

    const contRect = contenedorScroll.getBoundingClientRect();
    const diaRect = diaActual.getBoundingClientRect();

    const offsetLeft = diaRect.left - contRect.left;
    const offsetTop = diaRect.top - contRect.top;

    const targetLeft = contenedorScroll.scrollLeft + offsetLeft - (contenedorScroll.clientWidth / 2 - diaActual.clientWidth / 2);
    // Alinear el inicio del día justo debajo de la cabecera sticky
    const margenSeguridad = 8;
    const targetTop = contenedorScroll.scrollTop + offsetTop - alturaCabecera - margenSeguridad;

    contenedorScroll.scrollTo({
        left: Math.max(0, targetLeft),
        top: Math.max(0, targetTop),
        behavior: 'smooth'
    });
}

// Actualizar calendario cuando cambien las fechas
function actualizarCalendario() {
    distribuirTrabajos();
    // Actualizar estadísticas
    actualizarEstadisticasTrabajos();
}

// Función para actualizar las estadísticas de trabajos
function actualizarEstadisticasTrabajos() {
    const estadisticasContainer = document.getElementById('estadisticasTrabajos');
    if (!estadisticasContainer) return;
    
    // Contar trabajos por estado
    let autorizados = 0;
    let aprobados = 0;
    let pendientes = 0;
    
    // Contar solo trabajos asignados al calendario
    trabajosAsignados.forEach(indice => {
        // Verificar filtro de tipo
        const trabajo = trabajos[indice];
        if (!filtroTipos.has('TODOS') && !filtroTipos.has(trabajo.tipoMantenimiento)) {
            return;
        }

        const estado = estadosPermisos.get(indice) || 'PENDIENTE';
        if (estado === 'AUTORIZADO') {
            autorizados++;
        } else if (estado === 'APROBADO') {
            aprobados++;
        } else {
            pendientes++;
        }
    });
    
    // Si no hay trabajos asignados, mostrar mensaje
    const totalTrabajos = autorizados + aprobados + pendientes;
    if (totalTrabajos === 0) {
        estadisticasContainer.innerHTML = '<span class="estadistica-texto">Sin trabajos asignados</span>';
        return;
    }
    
    // Crear HTML de estadísticas
    estadisticasContainer.innerHTML = `
        <div class="estadistica-item">
            <span class="estadistica-label">TOT:</span>
            <span class="estadistica-valor">${totalTrabajos}</span>
        </div>
        <div class="estadistica-item estado-autorizado" title="Permiso de trabajo aprobado con todas las firmas">
            <span class="estadistica-label">AUTO:</span>
            <span class="estadistica-valor">${autorizados}</span>
        </div>
        <div class="estadistica-item estado-aprobado" title="Permiso de trabajo aprobado pendiente de alguna firma">
            <span class="estadistica-label">APRO:</span>
            <span class="estadistica-valor">${aprobados}</span>
        </div>
        <div class="estadistica-item estado-pendiente" title="Permiso de trabajo pendiente">
            <span class="estadistica-label">RESTO:</span>
            <span class="estadistica-valor">${pendientes}</span>
        </div>
    `;
}

// Generar un mes del calendario
// diaInicio y diaFin: rango de días a mostrar (null = todos los días del mes)
// esPrimerMes: si es true, mostrar los días de la semana
// indiceMes: índice del mes para alternar fondos (0, 1, 2, ...)
// esUltimoMes: si es true, puede mostrar días de relleno del mes siguiente
// tieneMesAnterior: si es true, hay un mes anterior en el rango (no añadir días del mes anterior)
// tieneMesSiguiente: si es true, hay un mes siguiente en el rango (no añadir días del mes siguiente)
function generarMesCalendario(ano, mes, diaInicio = null, diaFin = null, esPrimerMes = true, indiceMes = 0, esUltimoMes = true, tieneMesAnterior = false, tieneMesSiguiente = false) {
    const contenedorMes = document.createElement('div');
    contenedorMes.className = 'mes-calendario';
    
    // Añadir clase para alternar fondos (par/impar)
    if (indiceMes % 2 === 0) {
        contenedorMes.classList.add('mes-par');
    } else {
        contenedorMes.classList.add('mes-impar');
    }
    
    // NO mostrar header del mes (eliminado para calendario continuo)
    
    // Días de la semana (empezando en lunes) - solo mostrar en el primer mes
    if (esPrimerMes) {
        const diasSemana = document.createElement('div');
        diasSemana.className = 'dias-semana';
        const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        nombresDias.forEach(dia => {
            const diaSemana = document.createElement('div');
            diaSemana.className = 'dia-semana';
            diaSemana.textContent = dia;
            diasSemana.appendChild(diaSemana);
        });
        contenedorMes.appendChild(diasSemana);
    }
    
    // Grid de días
    const diasMes = document.createElement('div');
    diasMes.className = 'dias-mes';
    
    // Determinar el primer día a mostrar
    const primerDiaAMostrar = diaInicio !== null ? diaInicio : 1;
    const ultimoDiaAMostrar = diaFin !== null ? diaFin : new Date(ano, mes + 1, 0).getDate();
    
    // Primer día a mostrar
    const primerDia = new Date(ano, mes, primerDiaAMostrar);
    // Convertir día de la semana: domingo=0 -> lunes=0 (lunes=0, martes=1, ..., domingo=6)
    const diaSemanaJS = primerDia.getDay(); // 0=domingo, 1=lunes, ..., 6=sábado
    const diaSemanaInicio = (diaSemanaJS + 6) % 7; // 0=lunes, 1=martes, ..., 6=domingo
    
    // Días del mes anterior (relleno) - NUNCA mostrar días del mes anterior si hay un mes anterior en el rango
    // Si hay un mes anterior, ese mes ya generó sus días, así que solo mostrar celdas vacías
    if (diaSemanaInicio > 0) {
        if (!tieneMesAnterior && primerDiaAMostrar === 1) {
            // Solo mostrar días del mes anterior si NO hay mes anterior en el rango Y empezamos desde el día 1
            const ultimoDiaMesAnterior = new Date(ano, mes, 0);
            const ultimoDiaNumero = ultimoDiaMesAnterior.getDate();
            const diaSemanaUltimoJS = ultimoDiaMesAnterior.getDay();
            const diaSemanaUltimo = (diaSemanaUltimoJS + 6) % 7; // Convertir a lunes=0
            
            // Calcular cuántos días del mes anterior necesitamos mostrar
            const diasARellenar = diaSemanaInicio;
            
            for (let i = diasARellenar - 1; i >= 0; i--) {
                const dia = document.createElement('div');
                dia.className = 'dia-calendario otro-mes';
                
                // Calcular qué día de la semana queremos mostrar (0=lunes, 1=martes, etc.)
                const diaSemanaDeseado = diaSemanaInicio - 1 - i;
                
                // Calcular el día del mes anterior que corresponde a ese día de la semana
                // Convertir de vuelta a formato JS (domingo=0) para el cálculo
                const diaSemanaDeseadoJS = (diaSemanaDeseado + 1) % 7;
                const diaSemanaUltimoJSOriginal = ultimoDiaMesAnterior.getDay();
                const diferencia = (diaSemanaUltimoJSOriginal - diaSemanaDeseadoJS + 7) % 7;
                const diaNumero = ultimoDiaNumero - diferencia;
                
                dia.textContent = diaNumero;
                diasMes.appendChild(dia);
            }
        } else {
            // Si hay mes anterior o no empezamos desde el día 1, mostrar celdas vacías
            for (let i = 0; i < diaSemanaInicio; i++) {
                const dia = document.createElement('div');
                dia.className = 'dia-calendario otro-mes';
                dia.textContent = ''; // Celda vacía
                diasMes.appendChild(dia);
            }
        }
    }
    
    // Días del mes actual (solo el rango especificado)
    const hoy = new Date();
    const hoyStr = formatearFecha(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    for (let dia = primerDiaAMostrar; dia <= ultimoDiaAMostrar; dia++) {
        const diaElement = document.createElement('div');
        diaElement.className = 'dia-calendario';
        
        const fechaStr = formatearFecha(ano, mes, dia);
        const fechaDia = new Date(ano, mes, dia);
        fechaDia.setHours(0, 0, 0, 0);
        const hoyNormalizado = new Date(hoy);
        hoyNormalizado.setHours(0, 0, 0, 0);
        
        if (fechaStr === hoyStr) {
            diaElement.classList.add('dia-actual');
        } else if (fechaDia < hoyNormalizado) {
            diaElement.classList.add('dia-pasado');
        }
        diaElement.dataset.fecha = fechaStr;
        
        const cabeceraDia = document.createElement('div');
        cabeceraDia.className = 'dia-header';

        const numeroDia = document.createElement('div');
        numeroDia.className = 'numero-dia';
        // Mostrar día/mes en formato "16/Ene" (mes en texto)
        const nombresMesesAbrev = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre   '];
        numeroDia.textContent = `${dia} de ${nombresMesesAbrev[mes]} de ${ano}`;

        // Contenedor para estadísticas del día (Autorizados del total)
        const estadisticaDia = document.createElement('div');
        estadisticaDia.className = 'estadistica-dia';
        // Valores iniciales (se actualizarán en mostrarTrabajosEnDia)
        estadisticaDia.innerHTML = `<div class="estadistica-dia-item" title="Permisos autorizados"><span class="estadistica-badge">0 de 0</span></div>`;

        cabeceraDia.appendChild(numeroDia);
        cabeceraDia.appendChild(estadisticaDia);
        diaElement.appendChild(cabeceraDia);
        
        // Contenedor para trabajos del día
        const trabajosDia = document.createElement('div');
        trabajosDia.className = 'trabajos-dia';
        diaElement.appendChild(trabajosDia);
        
        // Mostrar trabajos asignados a este día
        mostrarTrabajosEnDia(trabajosDia, fechaStr);
        
        // Eventos de drop
        diaElement.addEventListener('dragover', handleDragOver);
        diaElement.addEventListener('drop', handleDrop);
        diaElement.addEventListener('dragleave', handleDragLeave);
        
        diasMes.appendChild(diaElement);
    }
    
    // Días del mes siguiente (relleno) - NUNCA mostrar días del mes siguiente si hay un mes siguiente en el rango
    // Si hay un mes siguiente, ese mes ya generará sus días, así que solo mostrar celdas vacías
    const ultimoDiaDelMes = new Date(ano, mes + 1, 0).getDate();
    const totalCeldas = diasMes.children.length;
    const semanasCompletas = Math.ceil(totalCeldas / 7);
    const celdasNecesarias = semanasCompletas * 7;
    const celdasRestantes = celdasNecesarias - totalCeldas;
    
    if (celdasRestantes > 0) {
        // Solo mostrar días del mes siguiente si NO hay mes siguiente Y es el último mes Y terminamos en el último día
        if (!tieneMesSiguiente && esUltimoMes && ultimoDiaAMostrar === ultimoDiaDelMes) {
            // Solo en este caso, mostrar días del mes siguiente
            for (let dia = 1; dia <= celdasRestantes; dia++) {
                const diaElement = document.createElement('div');
                diaElement.className = 'dia-calendario otro-mes';
                diaElement.textContent = dia;
                diasMes.appendChild(diaElement);
            }
        } else {
            // En cualquier otro caso (hay mes siguiente o no terminamos en el último día), mostrar celdas vacías
            for (let dia = 1; dia <= celdasRestantes; dia++) {
                const diaElement = document.createElement('div');
                diaElement.className = 'dia-calendario otro-mes';
                diaElement.textContent = ''; // Celda vacía
                diasMes.appendChild(diaElement);
            }
        }
    }
    
    contenedorMes.appendChild(diasMes);
    return contenedorMes;
}

// Formatear fecha como YYYY-MM-DD
function formatearFecha(ano, mes, dia) {
    const mesStr = String(mes + 1).padStart(2, '0');
    const diaStr = String(dia).padStart(2, '0');
    return `${ano}-${mesStr}-${diaStr}`;
}

// Obtener hora de un trabajo
function obtenerHoraTrabajo(indice) {
    // Si hay una hora modificada, usar esa
    if (horasTrabajos.has(indice)) {
        return horasTrabajos.get(indice);
    }
    
    // Usar la hora del trabajo directamente
    const trabajo = trabajos[indice];
    const hora = trabajo['Hora inicio validez'];
    
    // Si está vacío, devolver 00:00
    if (hora === null || hora === undefined || hora === '') {
        return '00:00';
    }
    
    // Si es número (formato Excel), convertir
    if (typeof hora === 'number') {
        const totalMinutos = Math.round(hora * 24 * 60);
        const h = Math.floor(totalMinutos / 60) % 24;
        const m = totalMinutos % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    
    // Si es string con formato H:MM:SS o HH:MM:SS, extraer solo HH:MM
    const horaStr = String(hora).trim();
    const match = horaStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (match) {
        const h = parseInt(match[1]);
        const m = parseInt(match[2]);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    
    return horaStr;
}

// Normalizar hora a formato HH:MM
function normalizarHora(hora) {
    // Si es null, undefined o string vacío, devolver 00:00
    if (hora === null || hora === undefined || hora === '') return '00:00';
    
    // Si es un número (formato Excel: 0 = 00:00, 0.29166667 = 7:00)
    if (typeof hora === 'number') {
        // Excel almacena horas como fracción del día
        const totalMinutos = Math.round(hora * 24 * 60);
        const h = Math.floor(totalMinutos / 60) % 24;
        const m = totalMinutos % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    
    // Convertir a string
    const horaStr = String(hora).trim();
    
    // Si es string vacío, devolver 00:00
    if (horaStr === '') return '00:00';
    
    // Si es "0" como string, convertir a 00:00
    if (horaStr === '0') return '00:00';
    
    // Si parece un número decimal como string (0.xxxxx)
    if (/^[\d.]+$/.test(horaStr)) {
        const horaNum = parseFloat(horaStr);
        if (!isNaN(horaNum)) {
            const totalMinutos = Math.round(horaNum * 24 * 60);
            const h = Math.floor(totalMinutos / 60) % 24;
            const m = totalMinutos % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
    }
    
    // Devolver como string directamente
    return horaStr;
}

// Construir URL dinámica para una Orden (rellena con ceros a la izquierda si hace falta)
function construirUrlOrden(orden) {
    if (!orden) return '';
    // Asegurar que orden sea string y tenga al menos 12 caracteres con ceros a la izquierda
    const ordenStr = String(orden).trim();
    const ordenPad = ordenStr.padStart(12, '0');
    const base = 'https://gadea.naturgy.com/sap/bc/ui5_ui5/ui2/ushell/shells/abap/FioriLaunchpad.html';
    const params = '?sap-client=300&sap-language=ES#MaintenanceOrder-display?AUFNR=';
    return `${base}${params}${ordenPad}&sap-app-origin-hint=&sap-ui-technology=WDA`;
}

// Construir URL dinámica para una Solicitud (rellena con ceros a la izquierda si hace falta)
function construirUrlSolicitud(solicitud) {
    if (!solicitud) return '';
    const solStr = String(solicitud).trim();
    const solPad = solStr.padStart(12, '0');
    const base = 'https://gadea.naturgy.com/sap/bc/ui5_ui5/ui2/ushell/shells/abap/FioriLaunchpad.html';
    const params = '?sap-client=300&sap-language=ES#GadeaWCM-openWCTL?WCSWAPI-WAPINR=';
    return `${base}${params}${solPad}&sap-app-origin-hint=&sap-ui-technology=GUI`;
}

// Comparar horas para ordenar
function compararHoras(hora1, hora2) {
    const [h1, m1] = hora1.split(':').map(Number);
    const [h2, m2] = hora2.split(':').map(Number);
    
    if (h1 !== h2) {
        return h1 - h2;
    }
    return m1 - m2;
}

// Ajustar hover para que no se recorte en los bordes del calendario
function ajustarHoverTrabajo(elemento) {
    const calendarioSection = elemento.closest('.calendario-section');
    if (!calendarioSection) return;

    const scale = 1.8;
    const rect = elemento.getBoundingClientRect();
    const containerRect = calendarioSection.getBoundingClientRect();
    const deltaX = (rect.width * scale - rect.width) / 2;

    let translateX = 0;
    const leftOverflow = rect.left - deltaX - containerRect.left;
    if (leftOverflow < 0) translateX += -leftOverflow;
    const rightOverflow = rect.right + deltaX - containerRect.right;
    if (rightOverflow > 0) translateX -= rightOverflow;

    if (translateX !== 0) {
        elemento.style.setProperty('--hover-translate-x', `${Math.round(translateX)}px`);
    } else {
        elemento.style.removeProperty('--hover-translate-x');
    }
}

// Mostrar trabajos asignados a un día
function mostrarTrabajosEnDia(contenedor, fechaStr) {
    contenedor.innerHTML = '';
    
    const indicesTrabajos = trabajosConFechas.get(fechaStr) || [];
    // Calcular estadística por día: autorizados vs resto (respetando filtroTipos)
    try {
        const contenedorDia = contenedor.parentElement; // el "diaElement"
        if (contenedorDia) {
            const estadisticaDiv = contenedorDia.querySelector('.estadistica-dia');
            if (estadisticaDiv) {
                let autorizados = 0;
                let total = 0;
                indicesTrabajos.forEach(ind => {
                    const trabajo = trabajos[ind];
                    // respetar filtro de tipo
                    if (!filtroTipos.has('TODOS') && !filtroTipos.has(trabajo.tipoMantenimiento)) return;
                    total++;
                    const estado = (estadosPermisos.get(ind) || 'PENDIENTE');
                    if (estado === 'AUTORIZADO') autorizados++;
                });
                // Actualizar HTML del bloque de estadísticas
                estadisticaDiv.innerHTML = `<div class="estadistica-dia-item" title="Permisos autorizados del total del día"><span class="estadistica-badge">${autorizados} de ${total}</span></div>`;
            }
        }
    } catch (err) {
        console.warn('Error actualizando estadística diaria:', err);
    }
    
    // Ordenar trabajos por hora
    const trabajosConHora = indicesTrabajos.map(indice => {
        const trabajo = trabajos[indice];
        const hora = normalizarHora(obtenerHoraTrabajo(indice));
        return { indice, hora, trabajo };
    });
    
    trabajosConHora.sort((a, b) => compararHoras(a.hora, b.hora));
    
    trabajosConHora.forEach(({ indice, hora, trabajo }) => {
        // NUEVO: Filtro global
        if (!filtroTipos.has('TODOS') && !filtroTipos.has(trabajo.tipoMantenimiento)) {
            return;
        }

        const trabajoElement = document.createElement('div');
        trabajoElement.className = 'trabajo-en-calendario';
        
        // NUEVO: Añadir clase de tipo
        if (trabajo.claseTipo) {
            trabajoElement.classList.add(trabajo.claseTipo);
        }
        
        trabajoElement.draggable = true;
        trabajoElement.dataset.indice = indice;
        trabajoElement.dataset.fechaOrigen = fechaStr; // Guardar fecha de origen
        
        // Obtener texto breve y eliminar prefijo "HGPIe: " si existe
        let textoBreve = trabajo['Texto breve'] || `Trabajo ${indice + 1}`;
        //textoBreve = textoBreve.replace(/^HGPIe:\s*/i, ''); // Eliminar prefijo (case insensitive)
        
        // Obtener Orden y Solicitud
        const orden = trabajo['Orden'] || '';
        const solicitud = trabajo['Solicitud'] || '';
        
        // Crear contenedor para la primera línea (hora, Orden, Solicitud)
        const primeraLinea = document.createElement('div');
        primeraLinea.className = 'trabajo-primera-linea';
        
        const horaContainer = document.createElement('div');
        horaContainer.className = 'trabajo-hora';
        horaContainer.textContent = `⏰ ${hora}`;
        
        const ordenContainer = document.createElement('div');
        ordenContainer.className = 'trabajo-orden';
        ordenContainer.textContent = `📋 ${orden}`;
        ordenContainer.title = 'Clic para copiar número de orden';
        ordenContainer.style.cursor = 'pointer';
        ordenContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            if (orden) {
                navigator.clipboard.writeText(orden).then(() => {
                    const textoOriginal = ordenContainer.textContent;
                    ordenContainer.textContent = '✅ Copiado!';
                    setTimeout(() => {
                        ordenContainer.textContent = textoOriginal;
                    }, 1000);
                }).catch(err => {
                    console.error('Error al copiar:', err);
                });
            }
        });
        
        const solicitudContainer = document.createElement('div');
        solicitudContainer.className = 'trabajo-solicitud';
        solicitudContainer.textContent = `📄 ${solicitud}`;
        solicitudContainer.title = 'Clic para copiar número de solicitud';
        solicitudContainer.style.cursor = 'pointer';
        solicitudContainer.addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar que se propague al contenedor padre
            if (solicitud) {
                navigator.clipboard.writeText(solicitud).then(() => {
                    // Feedback visual temporal
                    const textoOriginal = solicitudContainer.textContent;
                    solicitudContainer.textContent = '✅ Copiado!';
                    setTimeout(() => {
                        solicitudContainer.textContent = textoOriginal;
                    }, 1000);
                }).catch(err => {
                    console.error('Error al copiar:', err);
                });
            }
        });
        
        primeraLinea.appendChild(horaContainer);
        primeraLinea.appendChild(ordenContainer);
        // Añadir icono-link para abrir la orden en una nueva pestaña
        const ordenParaUrlCal = (orden || '').toString().padStart(12, '0');
        const urlOrdenCal = construirUrlOrden(ordenParaUrlCal);
        const linkOrdenContainer = document.createElement('div');
        linkOrdenContainer.className = 'trabajo-orden-link';
        linkOrdenContainer.innerHTML = `<a href="${urlOrdenCal}" target="_blank" rel="noopener noreferrer" title="Abrir orden ${ordenParaUrlCal}">🔗</a>`;
        primeraLinea.appendChild(linkOrdenContainer);
        // Añadir Solicitud y su icono-link en orden: número de solicitud + icono
        primeraLinea.appendChild(solicitudContainer);
        const solicitudParaUrlCal = (solicitud || '').toString().padStart(12, '0');
        const urlSolicitudCal = construirUrlSolicitud(solicitudParaUrlCal);
        const linkSolicitudCal = document.createElement('div');
        linkSolicitudCal.className = 'trabajo-solicitud-link';
        linkSolicitudCal.innerHTML = `<a href="${urlSolicitudCal}" target="_blank" rel="noopener noreferrer" title="Abrir solicitud ${solicitudParaUrlCal}">📎</a>`;
        primeraLinea.appendChild(linkSolicitudCal);
        
        // NUEVO: Añadir icono de descargo si Utilización = YU1
        if (trabajo.requiereDescargo) {
            const descargoContainer = document.createElement('div');
            descargoContainer.className = 'trabajo-descargo';
            descargoContainer.textContent = '🔒';
            descargoContainer.title = 'Requiere acciones de aislamiento';
            primeraLinea.appendChild(descargoContainer);
            trabajoElement.classList.add('requiere-descargo');
        }
        
        // Crear contenedor para el texto (segunda línea)
        const textoContainer = document.createElement('div');
        textoContainer.className = 'trabajo-texto';
        textoContainer.textContent = textoBreve;
        textoContainer.title = 'Clic para copiar texto del trabajo';
        textoContainer.style.cursor = 'pointer';
        textoContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            if (textoBreve) {
                navigator.clipboard.writeText(textoBreve).then(() => {
                    const textoOriginal = textoContainer.textContent;
                    textoContainer.textContent = '✅ Copiado!';
                    setTimeout(() => {
                        textoContainer.textContent = textoOriginal;
                    }, 1000);
                }).catch(err => {
                    console.error('Error al copiar:', err);
                });
            }
        });
        
        trabajoElement.appendChild(primeraLinea);
        trabajoElement.appendChild(textoContainer);
        trabajoElement.title = `${textoBreve} - ${hora}`;

        // Ajuste dinámico para que el hover no se recorte en los bordes
        trabajoElement.addEventListener('mouseenter', () => ajustarHoverTrabajo(trabajoElement));
        trabajoElement.addEventListener('mouseleave', () => {
            trabajoElement.style.removeProperty('--hover-translate-x');
        });
        
        // Eventos de drag para trabajos en el calendario
        trabajoElement.addEventListener('dragstart', handleDragStartCalendario);
        trabajoElement.addEventListener('dragend', handleDragEnd);
        
        // Aplicar color según el estado del permiso
        const estadoPermiso = estadosPermisos.get(indice) || 'PENDIENTE';
        trabajoElement.dataset.estado = estadoPermiso;
        if (estadoPermiso === 'AUTORIZADO') {
            trabajoElement.classList.add('estado-autorizado');
        } else if (estadoPermiso === 'APROBADO') {
            trabajoElement.classList.add('estado-aprobado');
        } else {
            trabajoElement.classList.add('estado-pendiente');
        }
        
        // Evento de clic derecho: mostrar modal con datos importantes (Orden, Solicitud, Texto breve)
        // Anteriormente abría el editor de hora; ahora mostramos un modal con botones de copiar y un botón Cerrar
        trabajoElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            mostrarDetallesTrabajoContextMenu(indice, trabajoElement, fechaStr);
        });
        
        contenedor.appendChild(trabajoElement);
    });
}

// Mostrar editor de hora
function mostrarEditorHora(indice, elemento, horaActual, fechaInicioStr, estadoActual = 'SOLICITADO') {
    // Obtener fecha de finalización actual o calcular por defecto (día siguiente)
    const trabajo = trabajos[indice];
    let fechaFinActual = '';
    
    if (fechasFinTrabajos.has(indice)) {
        fechaFinActual = fechasFinTrabajos.get(indice);
    } else if (trabajo['Validez a']) {
        fechaFinActual = normalizarFecha(trabajo['Validez a']);
    }
    
    // Si no hay fecha de finalización, calcular el día siguiente de la fecha de inicio
    if (!fechaFinActual && fechaInicioStr) {
        const fechaInicio = new Date(fechaInicioStr);
        fechaInicio.setDate(fechaInicio.getDate() + 1);
        const ano = fechaInicio.getFullYear();
        const mes = String(fechaInicio.getMonth() + 1).padStart(2, '0');
        const dia = String(fechaInicio.getDate()).padStart(2, '0');
        fechaFinActual = `${ano}-${mes}-${dia}`;
    }
    
    // Crear modal/editor de hora, fecha de finalización y estado del permiso
    const editor = document.createElement('div');
    editor.className = 'editor-hora';
    editor.innerHTML = `
        <div class="editor-hora-contenido">
            <h3>Editar trabajo</h3>
            <div style="margin-bottom: 15px;">
                <label for="horaInput" style="display: block; margin-bottom: 5px; font-weight: 600;">Hora de inicio:</label>
                <input type="time" id="horaInput" value="${horaActual}" class="hora-input" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
            </div>
            <div style="margin-bottom: 15px;">
                <label for="fechaFinInput" style="display: block; margin-bottom: 5px; font-weight: 600;">Validez a:</label>
                <input type="date" id="fechaFinInput" value="${fechaFinActual}" class="fecha-input" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" />
            </div>
            <div style="margin-bottom: 15px;">
                <label for="estadoPermisoInput" style="display: block; margin-bottom: 5px; font-weight: 600;">Estado del permiso:</label>
                <select id="estadoPermisoInput" class="estado-input" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                    <option value="SOLICITADO" ${estadoActual === 'SOLICITADO' ? 'selected' : ''}>SOLICITADO</option>
                    <option value="AUTORIZADO" ${estadoActual === 'AUTORIZADO' ? 'selected' : ''}>AUTORIZADO</option>
                </select>
            </div>
            <div class="editor-hora-botones">
                <button class="btn-guardar-hora">Guardar</button>
                <button class="btn-cancelar-hora">Cancelar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(editor);
    
    const horaInput = editor.querySelector('#horaInput');
    const fechaFinInput = editor.querySelector('#fechaFinInput');
    const estadoPermisoInput = editor.querySelector('#estadoPermisoInput');
    const btnGuardar = editor.querySelector('.btn-guardar-hora');
    const btnCancelar = editor.querySelector('.btn-cancelar-hora');
    
    // Guardar hora, fecha de finalización y estado del permiso
    btnGuardar.addEventListener('click', () => {
        const nuevaHora = normalizarHora(horaInput.value);
        horasTrabajos.set(indice, nuevaHora);
        
        // Guardar fecha de finalización si se ha modificado
        const nuevaFechaFin = fechaFinInput.value;
        if (nuevaFechaFin) {
            fechasFinTrabajos.set(indice, nuevaFechaFin);
        }
        
        // Guardar estado del permiso
        const nuevoEstado = estadoPermisoInput.value;
        estadosPermisos.set(indice, nuevoEstado);
        
        // Actualizar visualización
        const fechaOrigen = elemento.dataset.fechaOrigen;
        if (fechaOrigen) {
            const contenedor = elemento.closest('.trabajos-dia');
            if (contenedor) {
                mostrarTrabajosEnDia(contenedor, fechaOrigen);
            }
        }
        
        // (Gantt eliminado)
        
        // Actualizar estadísticas
        actualizarEstadisticasTrabajos();
        
        document.body.removeChild(editor);
    });
    
    // Cancelar
    btnCancelar.addEventListener('click', () => {
        document.body.removeChild(editor);
    });
    
    // Cerrar al hacer clic fuera
    editor.addEventListener('click', (e) => {
        if (e.target === editor) {
            document.body.removeChild(editor);
        }
    });
    
    // Enfocar el input de hora
    horaInput.focus();
}

// Mostrar modal con detalles importantes al hacer clic derecho
function mostrarDetallesTrabajoContextMenu(indice, elemento, fechaStr) {
    const trabajo = trabajos[indice];
    if (!trabajo) return;

    const orden = trabajo['Orden'] || '';
    const solicitud = trabajo['Solicitud'] || '';
    const textoBreve = trabajo['Texto breve'] || '';

    // Calcular CyMP (solicitudes que empiezan por '4' y coinciden por Texto breve)
    const cympArray = calcularCyMPParaTrabajo(indice);
    const cympStr = (cympArray && cympArray.length > 0) ? cympArray.join(', ') : '';

    // Crear modal (markup con clases para estilos desde styles.css)
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-detalles';

    modal.innerHTML = `
        <h3>Detalles del trabajo</h3>
        <div class="modal-row">
            <div class="modal-label"><strong>Orden:</strong><div id="modal-orden" class="modal-value">${orden}</div></div>
            <button id="btn-copiar-orden" class="modal-btn modal-btn-copy modal-small-btn">Copiar</button>
        </div>
        <div class="modal-row">
            <div class="modal-label"><strong>Solicitud:</strong><div id="modal-solicitud" class="modal-value">${solicitud}</div></div>
            <button id="btn-copiar-solicitud" class="modal-btn modal-btn-copy modal-small-btn">Copiar</button>
        </div>
        <div class="modal-row">
            <div class="modal-label"><strong>CyMP:</strong><div id="modal-cymp" class="modal-value">${cympStr}</div></div>
            <button id="btn-copiar-cymp" class="modal-btn modal-btn-copy modal-small-btn">Copiar</button>
        </div>
        <div class="modal-row">
            <div class="modal-label"><strong>Texto breve:</strong><div id="modal-texto" class="modal-value">${textoBreve}</div></div>
            <button id="btn-copiar-texto" class="modal-btn modal-btn-copy" style="height:40px;">Copiar</button>
        </div>
        <div class="modal-row">
            <div class="modal-label"><strong>Aislamientos:</strong><div id="modal-aislamientos" class="modal-value"></div></div>
            <button id="btn-copiar-aislamientos" class="modal-btn modal-btn-copy" style="height:40px;">Copiar</button>
        </div>
        <div class="modal-actions">
            <button id="btn-cerrar-modal" class="modal-btn modal-btn-close">Cerrar</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Funciones copiar
    const copiarTexto = (text, button) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            const original = button.textContent;
            button.textContent = '✅ Copiado';
            setTimeout(() => { button.textContent = original; }, 1000);
        }).catch(err => {
            console.error('Error copiando al portapapeles', err);
        });
    };

    const btnOrden = modal.querySelector('#btn-copiar-orden');
    const btnSolicitud = modal.querySelector('#btn-copiar-solicitud');
    const btnTexto = modal.querySelector('#btn-copiar-texto');
    const btnCyMP = modal.querySelector('#btn-copiar-cymp');
    const btnAislamientos = modal.querySelector('#btn-copiar-aislamientos');
    const btnCerrar = modal.querySelector('#btn-cerrar-modal');

    btnOrden.addEventListener('click', (e) => { e.stopPropagation(); copiarTexto(orden, btnOrden); });
    btnSolicitud.addEventListener('click', (e) => { e.stopPropagation(); copiarTexto(solicitud, btnSolicitud); });
    btnTexto.addEventListener('click', (e) => { e.stopPropagation(); copiarTexto(textoBreve, btnTexto); });
    if (btnCyMP) {
        btnCyMP.addEventListener('click', (e) => { e.stopPropagation(); copiarTexto(cympStr, btnCyMP); });
    }
    // Mostrar aislamientos asignados a la solicitud de este trabajo
    const modalAislamientosDiv = modal.querySelector('#modal-aislamientos');
    const solicitudKey = (trabajo['Solicitud'] || '').toString().trim();
    const aislamientos = aislamientosPorSolicitud.get(solicitudKey) || [];
    if (modalAislamientosDiv) {
        if (aislamientos.length === 0) {
            modalAislamientosDiv.textContent = 'Sin aislamientos asignados';
        } else {
            // Mostrar cada aislamiento en nueva línea con número - descripción - estados
            modalAislamientosDiv.innerHTML = aislamientos.map(a => `${a.numero} — ${a.descripcion} <br><small>${a.estados}</small>`).join('<hr style="border:none;border-top:1px solid #eee;margin:6px 0;">');
        }
    }
    if (btnAislamientos) {
        btnAislamientos.addEventListener('click', (e) => { e.stopPropagation(); const txt = aislamientos.map(a => `${a.numero} | ${a.descripcion} | ${a.estados}`).join('\n'); copiarTexto(txt, btnAislamientos); });
    }

    const cerrar = () => {
        if (overlay && overlay.parentElement) document.body.removeChild(overlay);
        // quitar listener de teclado
        document.removeEventListener('keydown', onKeyDownClose);
    };

    btnCerrar.addEventListener('click', (e) => { e.stopPropagation(); cerrar(); });

    // Cerrar al hacer clic fuera del modal
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cerrar();
    });

    // Evitar propagación del click dentro del modal para no cerrar
    modal.addEventListener('click', (e) => { e.stopPropagation(); });

    // Cerrar con tecla Escape
    function onKeyDownClose(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
            cerrar();
        }
    }
    document.addEventListener('keydown', onKeyDownClose);
}


