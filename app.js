// Estado de la aplicación
let trabajos = []; // Array con todos los datos de trabajos
let trabajosConFechas = new Map(); // Map: fecha (string) -> array de índices de trabajos
let trabajosAsignados = new Set(); // Set de índices de trabajos que han sido asignados a alguna fecha
let trabajosModificados = new Set(); // Set de índices de trabajos cuya fecha ha sido modificada
let valoresOriginalesValidoDe = new Map(); // Map: índice -> valor original de "Válido de"
let horasTrabajos = new Map(); // Map: índice -> hora (string) para almacenar horas modificadas
let fechasFinTrabajos = new Map(); // Map: índice -> fecha fin (string) para almacenar fechas de finalización modificadas
let estadosPermisos = new Map(); // Map: índice -> estado (string) para almacenar estados de permisos: 'SOLICITADO', 'EJECUTADO', 'CERRADO'

// Nombres de columnas esperadas
const COLUMNAS_ESPERADAS = [
    'Orden', 'Solicitud', 'Tp.doc.descargo', 'Texto breve', 'Status sistema',
    'Permisos', 'Documento', 'Texto explicativo', 'Interlocutor', 'Catálogo',
    'Creado por', 'Fecha de creación', 'Ubicación técnica', 'Equipo',
    'Texto explicativo', 'Válido de', 'Hora inicio validez', 'Validez a', 'Hora fin de validez'
];

// Referencias a elementos del DOM
const fileInput = document.getElementById('fileInput');
const exportBtn = document.getElementById('exportBtn');
const trabajosList = document.getElementById('trabajosList');
const calendarioContainer = document.getElementById('calendarioContainer');
const fechaInicio = document.getElementById('fechaInicio');
const fechaFin = document.getElementById('fechaFin');
const actualizarCalendarioBtn = document.getElementById('actualizarCalendarioBtn');
const ganttContainer = document.getElementById('ganttContainer');

// Event listeners
fileInput.addEventListener('change', handleFileUpload);
exportBtn.addEventListener('click', exportarExcel);
if (actualizarCalendarioBtn) {
    actualizarCalendarioBtn.addEventListener('click', actualizarCalendario);
}

// Manejar cambio de pestañas
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        // Remover clase active de todos los botones y contenidos
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Añadir clase active al botón y contenido seleccionado
        button.classList.add('active');
        document.getElementById(`${tabName}Tab`).classList.add('active');
        
        // Si se cambia a la pestaña Gantt, generar el gráfico
        if (tabName === 'gantt') {
            generarGantt();
        }
    });
});

// Función para manejar la carga del archivo Excel
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Leer la primera hoja
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convertir a JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonData.length < 2) {
                alert('El archivo Excel está vacío o no tiene datos válidos');
                return;
            }

            // La primera fila son los encabezados
            const headers = jsonData[0];
            
            // Validar que las columnas coincidan (aproximadamente)
            if (!validarColumnas(headers)) {
                alert('Las columnas del archivo no coinciden con el formato esperado');
                return;
            }

            // Procesar los datos
            procesarDatos(jsonData);
            
            // Mostrar trabajos y generar calendario
            mostrarTrabajos();
            generarCalendario();
            
            // Actualizar Gantt si está visible
            if (document.getElementById('ganttTab').classList.contains('active')) {
                generarGantt();
            }
            
            // Habilitar botón de exportar
            exportBtn.disabled = false;
            
        } catch (error) {
            console.error('Error al leer el archivo:', error);
            alert('Error al leer el archivo Excel: ' + error.message);
        }
    };
    
    reader.readAsArrayBuffer(file);
}

// Validar que las columnas sean correctas
function validarColumnas(headers) {
    // Comparar las primeras columnas importantes
    const columnasImportantes = ['Orden', 'Solicitud', 'Texto breve'];
    return columnasImportantes.every(col => 
        headers.some(h => h && h.toString().trim() === col)
    );
}

// Procesar los datos del Excel
function procesarDatos(jsonData) {
    trabajos = [];
    trabajosConFechas.clear();
    trabajosAsignados.clear();
    trabajosModificados.clear();
    valoresOriginalesValidoDe.clear();
    horasTrabajos.clear();
    fechasFinTrabajos.clear();
    estadosPermisos.clear();
    
    const headers = jsonData[0];
    
    // Buscar índices de las columnas
    const indiceValidoDe = headers.findIndex(h => 
        h && h.toString().trim() === 'Válido de'
    );
    const indiceActualizadaFecha = headers.findIndex(h => 
        h && (h.toString().trim() === 'Actualizada fecha' || h.toString().trim() === 'Actualizada Fecha')
    );
    const indiceEstadoPermiso = headers.findIndex(h => 
        h && h.toString().trim() === 'Estado permiso'
    );
    
    // Procesar cada fila (empezando desde la fila 1, ya que 0 son los headers)
    for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;
        
        // Crear objeto trabajo con todos los campos
        const trabajo = {};
        headers.forEach((header, index) => {
            if (header) {
                trabajo[header] = row[index] || '';
            }
        });
        
        // Añadir índice para referencia
        trabajo._indice = trabajos.length;
        trabajos.push(trabajo);
        
        // Guardar valor original de "Válido de"
        const valorValidoDe = indiceValidoDe !== -1 ? (row[indiceValidoDe] || '') : '';
        valoresOriginalesValidoDe.set(trabajo._indice, valorValidoDe);
        
        // Cargar estado del permiso si existe en el Excel
        if (indiceEstadoPermiso !== -1 && row[indiceEstadoPermiso]) {
            const estadoPermiso = String(row[indiceEstadoPermiso] || '').trim().toUpperCase();
            if (estadoPermiso === 'SOLICITADO' || estadoPermiso === 'EJECUTADO' || estadoPermiso === 'CERRADO') {
                estadosPermisos.set(trabajo._indice, estadoPermiso);
            }
        }
        
        // Verificar si el trabajo fue actualizado (campo "Actualizada fecha")
        const actualizadaFecha = indiceActualizadaFecha !== -1 ? 
            String(row[indiceActualizadaFecha] || '').trim().toLowerCase() : '';
        const fueActualizado = actualizadaFecha === 'sí' || actualizadaFecha === 'si' || actualizadaFecha === 'yes' || actualizadaFecha === 'true' || actualizadaFecha === '1';
        
        // Si el trabajo fue actualizado, procesar la fecha de "Válido de" y marcarlo como asignado
        if (fueActualizado && indiceValidoDe !== -1 && row[indiceValidoDe]) {
            const fechaValidoDe = row[indiceValidoDe];
            const fechaStr = normalizarFecha(fechaValidoDe);
            
            if (fechaStr) {
                // Si la fecha contiene múltiples fechas separadas por coma, procesar cada una
                const fechas = fechaStr.split(',').map(f => f.trim()).filter(f => f);
                
                if (fechas.length > 0) {
                    fechas.forEach(fecha => {
                        if (!trabajosConFechas.has(fecha)) {
                            trabajosConFechas.set(fecha, []);
                        }
                        const trabajosFecha = trabajosConFechas.get(fecha);
                        if (!trabajosFecha.includes(trabajo._indice)) {
                            trabajosFecha.push(trabajo._indice);
                        }
                    });
                    // Marcar como asignado solo si fue actualizado
                    trabajosAsignados.add(trabajo._indice);
                    trabajosModificados.add(trabajo._indice);
                }
            }
        }
    }
}

// Normalizar fecha a formato YYYY-MM-DD
function normalizarFecha(fecha) {
    if (!fecha) return null;
    
    // Si ya está en formato YYYY-MM-DD
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
        return fecha.split(' ')[0]; // Tomar solo la parte de la fecha si hay hora
    }
    
    // Si es un objeto Date de Excel
    if (fecha instanceof Date) {
        const ano = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
    
    // Si es un número (serial de Excel)
    if (typeof fecha === 'number') {
        // Excel cuenta los días desde el 1 de enero de 1900
        const fechaExcel = new Date((fecha - 25569) * 86400 * 1000);
        const ano = fechaExcel.getFullYear();
        const mes = String(fechaExcel.getMonth() + 1).padStart(2, '0');
        const dia = String(fechaExcel.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
    
    // Intentar parsear como string
    if (typeof fecha === 'string') {
        // Intentar diferentes formatos
        const formatos = [
            /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
            /(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
            /(\d{4})\/(\d{2})\/(\d{2})/, // YYYY/MM/DD
        ];
        
        for (const formato of formatos) {
            const match = fecha.match(formato);
            if (match) {
                if (formato === formatos[0] || formato === formatos[2]) {
                    // YYYY-MM-DD o YYYY/MM/DD
                    return `${match[1]}-${match[2]}-${match[3]}`;
                } else {
                    // DD/MM/YYYY
                    return `${match[3]}-${match[2]}-${match[1]}`;
                }
            }
        }
        
        // Intentar parsear con Date
        const fechaParsed = new Date(fecha);
        if (!isNaN(fechaParsed.getTime())) {
            const ano = fechaParsed.getFullYear();
            const mes = String(fechaParsed.getMonth() + 1).padStart(2, '0');
            const dia = String(fechaParsed.getDate()).padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
        }
    }
    
    return null;
}

// Mostrar la lista de trabajos (solo Texto breve)
function mostrarTrabajos() {
    trabajosList.innerHTML = '';
    
    // Hacer el listado un área de drop para devolver trabajos del calendario
    // Remover listeners anteriores si existen para evitar duplicados
    trabajosList.removeEventListener('dragover', handleDragOver);
    trabajosList.removeEventListener('drop', handleDropListado);
    trabajosList.removeEventListener('dragleave', handleDragLeave);
    
    // Añadir listeners
    trabajosList.addEventListener('dragover', handleDragOver);
    trabajosList.addEventListener('drop', handleDropListado);
    trabajosList.addEventListener('dragleave', handleDragLeave);
    trabajosList.classList.add('drop-zone');
    
    if (trabajos.length === 0) {
        trabajosList.innerHTML = '<p class="empty-message">No hay trabajos cargados</p>';
        return;
    }
    
    // Filtrar trabajos: solo mostrar los que NO empiezan por "4" en Solicitud y NO han sido asignados
    const trabajosFiltrados = trabajos.filter((trabajo, index) => {
        const solicitud = String(trabajo['Solicitud'] || '').trim();
        const noEmpiezaPor4 = !solicitud.startsWith('4');
        const noAsignado = !trabajosAsignados.has(trabajo._indice);
        return noEmpiezaPor4 && noAsignado;
    });
    
    // Mostrar contador de trabajos restantes
    const contadorDiv = document.createElement('div');
    contadorDiv.className = 'contador-trabajos';
    contadorDiv.style.cssText = 'padding: 10px; background: #e3f2fd; border-radius: 6px; margin-bottom: 15px; font-weight: 600; color: #1976d2; text-align: center;';
    contadorDiv.textContent = `Trabajos pendientes: ${trabajosFiltrados.length}`;
    trabajosList.appendChild(contadorDiv);
    
    if (trabajosFiltrados.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'empty-message';
        emptyMsg.textContent = 'No hay trabajos pendientes';
        trabajosList.appendChild(emptyMsg);
        return;
    }
    
    trabajosFiltrados.forEach((trabajo) => {
        const trabajoItem = document.createElement('div');
        trabajoItem.className = 'trabajo-item';
        trabajoItem.draggable = true;
        trabajoItem.dataset.indice = trabajo._indice; // Usar el índice original del trabajo
        
        // Obtener texto breve y eliminar prefijo "HGPIe: " si existe
        let textoBreve = trabajo['Texto breve'] || `Trabajo ${trabajo._indice + 1}`;
        textoBreve = textoBreve.replace(/^HGPIe:\s*/i, ''); // Eliminar prefijo (case insensitive)
        trabajoItem.textContent = textoBreve;
        
        // Eventos de drag
        trabajoItem.addEventListener('dragstart', handleDragStart);
        trabajoItem.addEventListener('dragend', handleDragEnd);
        
        trabajosList.appendChild(trabajoItem);
    });
}

// Manejar drop en el listado (devolver trabajo del calendario)
function handleDropListado(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const indiceTrabajo = parseInt(e.dataTransfer.getData('text/plain'));
    const fechaOrigen = e.dataTransfer.getData('text/fecha-origen');
    
    // Solo procesar si viene del calendario (tiene fecha de origen)
    if (!fechaOrigen) return;
    
    // Eliminar el trabajo de todas las fechas donde esté asignado
    for (const [fecha, indices] of trabajosConFechas.entries()) {
        const indice = indices.indexOf(indiceTrabajo);
        if (indice > -1) {
            indices.splice(indice, 1);
            trabajosConFechas.set(fecha, indices);
            // Actualizar visualización del día
            actualizarDiaCalendario(fecha);
        }
    }
    
    // Eliminar de trabajos asignados
    trabajosAsignados.delete(indiceTrabajo);
    
    // Verificar si la fecha cambió respecto al original
    const valorOriginal = valoresOriginalesValidoDe.get(indiceTrabajo) || '';
    const fechaActual = obtenerFechaTrabajo(indiceTrabajo);
    if (fechaActual === valorOriginal) {
        trabajosModificados.delete(indiceTrabajo);
    } else {
        trabajosModificados.add(indiceTrabajo);
    }
    
    // Actualizar listado para mostrar el trabajo nuevamente
    mostrarTrabajos();
    
    // Actualizar Gantt si está visible
    if (document.getElementById('ganttTab').classList.contains('active')) {
        generarGantt();
    }
}

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
}

// Actualizar calendario cuando cambien las fechas
function actualizarCalendario() {
    generarCalendario();
    // Actualizar Gantt si está visible
    if (document.getElementById('ganttTab').classList.contains('active')) {
        generarGantt();
    }
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
        const nombresDias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
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
    for (let dia = primerDiaAMostrar; dia <= ultimoDiaAMostrar; dia++) {
        const diaElement = document.createElement('div');
        diaElement.className = 'dia-calendario';
        
        const fechaStr = formatearFecha(ano, mes, dia);
        diaElement.dataset.fecha = fechaStr;
        
        const numeroDia = document.createElement('div');
        numeroDia.className = 'numero-dia';
        // Mostrar día/mes en formato "16/1"
        numeroDia.textContent = `${dia}/${mes + 1}`;
        diaElement.appendChild(numeroDia);
        
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

// Obtener hora de un trabajo (con valor por defecto si está vacío)
function obtenerHoraTrabajo(indice) {
    // Si hay una hora modificada, usar esa
    if (horasTrabajos.has(indice)) {
        return horasTrabajos.get(indice);
    }
    
    // Si no, usar la hora del trabajo o 7:00 por defecto
    const trabajo = trabajos[indice];
    const hora = trabajo['Hora inicio validez'] || '';
    return hora.trim() || '07:00';
}

// Normalizar hora a formato HH:MM
function normalizarHora(hora) {
    if (!hora) return '07:00';
    
    const horaStr = String(hora).trim();
    
    // Si ya está en formato HH:MM (incluyendo HH:MM:SS)
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(horaStr)) {
        const [h, m] = horaStr.split(':');
        const hNum = parseInt(h);
        const mNum = parseInt(m);
        if (hNum >= 0 && hNum < 24 && mNum >= 0 && mNum < 60) {
            return `${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`;
        }
    }
    
    // Si es solo un número, asumir que son horas
    if (/^\d+$/.test(horaStr)) {
        const hNum = parseInt(horaStr);
        if (hNum >= 0 && hNum < 24) {
            return `${String(hNum).padStart(2, '0')}:00`;
        }
    }
    
    // Si es un objeto Date, extraer hora y minutos
    if (hora instanceof Date) {
        const h = hora.getHours();
        const m = hora.getMinutes();
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    
    return '07:00'; // Valor por defecto
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

// Mostrar trabajos asignados a un día
function mostrarTrabajosEnDia(contenedor, fechaStr) {
    contenedor.innerHTML = '';
    
    const indicesTrabajos = trabajosConFechas.get(fechaStr) || [];
    
    // Ordenar trabajos por hora
    const trabajosConHora = indicesTrabajos.map(indice => {
        const trabajo = trabajos[indice];
        const hora = normalizarHora(obtenerHoraTrabajo(indice));
        return { indice, hora, trabajo };
    });
    
    trabajosConHora.sort((a, b) => compararHoras(a.hora, b.hora));
    
    trabajosConHora.forEach(({ indice, hora, trabajo }) => {
        const trabajoElement = document.createElement('div');
        trabajoElement.className = 'trabajo-en-calendario';
        trabajoElement.draggable = true;
        trabajoElement.dataset.indice = indice;
        trabajoElement.dataset.fechaOrigen = fechaStr; // Guardar fecha de origen
        
        // Obtener texto breve y eliminar prefijo "HGPIe: " si existe
        let textoBreve = trabajo['Texto breve'] || `Trabajo ${indice + 1}`;
        textoBreve = textoBreve.replace(/^HGPIe:\s*/i, ''); // Eliminar prefijo (case insensitive)
        
        // Crear contenedor para el texto y la hora
        const textoContainer = document.createElement('div');
        textoContainer.className = 'trabajo-texto';
        textoContainer.textContent = textoBreve;
        
        const horaContainer = document.createElement('div');
        horaContainer.className = 'trabajo-hora';
        horaContainer.textContent = hora;
        
        trabajoElement.appendChild(textoContainer);
        trabajoElement.appendChild(horaContainer);
        trabajoElement.title = `${textoBreve} - ${hora}`;
        
        // Eventos de drag para trabajos en el calendario
        trabajoElement.addEventListener('dragstart', handleDragStartCalendario);
        trabajoElement.addEventListener('dragend', handleDragEnd);
        
        // Aplicar color según el estado del permiso
        const estadoPermiso = estadosPermisos.get(indice) || 'SOLICITADO';
        trabajoElement.dataset.estado = estadoPermiso;
        trabajoElement.classList.add(`estado-${estadoPermiso.toLowerCase()}`);
        
        // Evento de clic derecho para editar hora, fecha de finalización y estado del permiso
        trabajoElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            mostrarEditorHora(indice, trabajoElement, hora, fechaStr, estadoPermiso);
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
                    <option value="EJECUTADO" ${estadoActual === 'EJECUTADO' ? 'selected' : ''}>EJECUTADO</option>
                    <option value="CERRADO" ${estadoActual === 'CERRADO' ? 'selected' : ''}>CERRADO</option>
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
        
        // Actualizar Gantt si está visible
        if (document.getElementById('ganttTab').classList.contains('active')) {
            generarGantt();
        }
        
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

// Manejar inicio de arrastre (desde el listado)
function handleDragStart(e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.dataset.indice);
    e.dataTransfer.setData('text/fecha-origen', ''); // Sin fecha de origen (viene del listado)
    e.target.classList.add('dragging');
}

// Manejar inicio de arrastre (desde el calendario)
function handleDragStartCalendario(e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.dataset.indice);
    e.dataTransfer.setData('text/fecha-origen', e.target.dataset.fechaOrigen);
    e.target.classList.add('dragging');
}

// Manejar fin de arrastre
function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    // Remover todas las clases drag-over de todos los elementos del calendario
    const elementosConDragOver = document.querySelectorAll('.drag-over');
    elementosConDragOver.forEach(elemento => {
        elemento.classList.remove('drag-over');
    });
}

// Manejar drag over
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Remover drag-over de otros días del calendario antes de añadirlo al actual
    // Solo si es un día del calendario (tiene data-fecha)
    if (e.currentTarget.dataset.fecha) {
        const otrosDias = document.querySelectorAll('.dia-calendario.drag-over');
        otrosDias.forEach(dia => {
            if (dia !== e.currentTarget) {
                dia.classList.remove('drag-over');
            }
        });
    }
    e.currentTarget.classList.add('drag-over');
}

// Manejar drag leave
function handleDragLeave(e) {
    // Verificar si realmente salimos del elemento
    // relatedTarget puede ser null o puede ser un elemento fuera del currentTarget
    const relatedTarget = e.relatedTarget;
    
    // Si relatedTarget es null, definitivamente salimos del elemento
    if (!relatedTarget) {
        e.currentTarget.classList.remove('drag-over');
        return;
    }
    
    // Si relatedTarget no está dentro del currentTarget, salimos del elemento
    if (!e.currentTarget.contains(relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
    // Si relatedTarget está dentro del currentTarget, no hacemos nada
    // (estamos moviendo el mouse dentro del mismo elemento)
}

// Manejar drop
function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const indiceTrabajo = parseInt(e.dataTransfer.getData('text/plain'));
    const fechaOrigen = e.dataTransfer.getData('text/fecha-origen');
    const fechaDestino = e.currentTarget.dataset.fecha;
    
    if (!fechaDestino) return; // No es un día válido del mes
    
    // Si viene de otra fecha del calendario, eliminar de la fecha de origen
    if (fechaOrigen && fechaOrigen !== fechaDestino) {
        const trabajosFechaOrigen = trabajosConFechas.get(fechaOrigen);
        if (trabajosFechaOrigen) {
            const indice = trabajosFechaOrigen.indexOf(indiceTrabajo);
            if (indice > -1) {
                trabajosFechaOrigen.splice(indice, 1);
                trabajosConFechas.set(fechaOrigen, trabajosFechaOrigen);
                
                // Actualizar visualización del día de origen
                actualizarDiaCalendario(fechaOrigen);
            }
        }
    }
    
    // Obtener o crear array de trabajos para la fecha destino
    if (!trabajosConFechas.has(fechaDestino)) {
        trabajosConFechas.set(fechaDestino, []);
    }
    
    const trabajosFechaDestino = trabajosConFechas.get(fechaDestino);
    
    // Añadir trabajo si no está ya asignado a esta fecha
    if (!trabajosFechaDestino.includes(indiceTrabajo)) {
        trabajosFechaDestino.push(indiceTrabajo);
        trabajosConFechas.set(fechaDestino, trabajosFechaDestino);
        
        // Marcar trabajo como asignado (si viene del listado)
        if (!fechaOrigen) {
            trabajosAsignados.add(indiceTrabajo);
        }
        
        // Marcar trabajo como modificado (si cambió de fecha o se asignó por primera vez)
        const valorOriginal = valoresOriginalesValidoDe.get(indiceTrabajo) || '';
        const fechaActual = obtenerFechaTrabajo(indiceTrabajo);
        // Comparar normalizando ambos valores (eliminar espacios, ordenar fechas si hay múltiples)
        const valorOriginalNormalizado = valorOriginal.toString().trim();
        const fechaActualNormalizada = fechaActual.trim();
        if (fechaActualNormalizada !== valorOriginalNormalizado) {
            trabajosModificados.add(indiceTrabajo);
        } else {
            // Si vuelve al valor original, quitar de modificados
            trabajosModificados.delete(indiceTrabajo);
        }
        
        // Actualizar visualización del calendario
        const trabajosDia = e.currentTarget.querySelector('.trabajos-dia');
        mostrarTrabajosEnDia(trabajosDia, fechaDestino);
        
        // Actualizar listado de trabajos (solo si viene del listado)
        if (!fechaOrigen) {
            mostrarTrabajos();
        }
        
        // Actualizar Gantt si está visible
        if (document.getElementById('ganttTab').classList.contains('active')) {
            generarGantt();
        }
    }
}

// Obtener la fecha asignada a un trabajo (puede ser múltiple)
function obtenerFechaTrabajo(indiceTrabajo) {
    const fechas = [];
    for (const [fecha, indices] of trabajosConFechas.entries()) {
        if (indices.includes(indiceTrabajo)) {
            fechas.push(fecha);
        }
    }
    return fechas.join(', ');
}

// Actualizar visualización de un día específico del calendario
function actualizarDiaCalendario(fechaStr) {
    // Buscar el día en el calendario
    const diaElement = document.querySelector(`[data-fecha="${fechaStr}"]`);
    if (diaElement) {
        const trabajosDia = diaElement.querySelector('.trabajos-dia');
        if (trabajosDia) {
            mostrarTrabajosEnDia(trabajosDia, fechaStr);
        }
    }
}

// Exportar a Excel
function exportarExcel() {
    if (trabajos.length === 0) {
        alert('No hay trabajos para exportar');
        return;
    }
    
    try {
        // Crear array de datos para exportar
        const datosExportar = [];
        
        // Añadir encabezados (columnas originales + nuevas columnas)
        const headers = COLUMNAS_ESPERADAS.slice();
        headers.push('Actualizada fecha');
        headers.push('Estado permiso');
        datosExportar.push(headers);
        
        // Procesar cada trabajo
        trabajos.forEach((trabajo, indice) => {
            const fila = [];
            
            // Añadir todos los campos originales en el orden esperado
            COLUMNAS_ESPERADAS.forEach((columna, colIndex) => {
                let valor = trabajo[columna] || '';
                
                // Si es la columna "Válido de", actualizar con la fecha asignada
                if (columna === 'Válido de') {
                    const fechaAsignada = obtenerFechaTrabajo(indice);
                    valor = fechaAsignada || valor; // Usar fecha asignada si existe, sino mantener original
                }
                
                // Si es la columna "Hora inicio validez", usar la hora modificada si existe
                if (columna === 'Hora inicio validez') {
                    if (horasTrabajos.has(indice)) {
                        valor = horasTrabajos.get(indice);
                    } else if (!valor || valor.trim() === '') {
                        valor = '07:00'; // Valor por defecto si está vacío
                    }
                }
                
                // Si es la columna "Validez a", usar la fecha modificada si existe
                if (columna === 'Validez a') {
                    if (fechasFinTrabajos.has(indice)) {
                        valor = fechasFinTrabajos.get(indice);
                    }
                }
                
                fila.push(valor);
            });
            
            // Añadir campo "Actualizada fecha" (Sí/No)
            const actualizadaFecha = trabajosModificados.has(indice) ? 'Sí' : 'No';
            fila.push(actualizadaFecha);
            
            // Añadir campo "Estado permiso"
            const estadoPermiso = estadosPermisos.get(indice) || 'SOLICITADO';
            fila.push(estadoPermiso);
            
            datosExportar.push(fila);
        });
        
        // Crear workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(datosExportar);
        
        // Ajustar ancho de columnas
        const colWidths = COLUMNAS_ESPERADAS.map(() => ({ wch: 15 }));
        colWidths.push({ wch: 15 }); // Para la columna "Actualizada fecha"
        colWidths.push({ wch: 15 }); // Para la columna "Estado permiso"
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, 'Trabajos con Fechas');
        
        // Generar nombre de archivo con timestamp
        const fecha = new Date();
        const fechaStr = fecha.toISOString().split('T')[0];
        const nombreArchivo = `Trabajos_Con_Fechas_${fechaStr}.xlsx`;
        
        // Descargar archivo
        XLSX.writeFile(wb, nombreArchivo);
        
        alert('Archivo exportado exitosamente');
        
    } catch (error) {
        console.error('Error al exportar:', error);
        alert('Error al exportar el archivo: ' + error.message);
    }
}

// Generar gráfico Gantt
function generarGantt() {
    if (trabajos.length === 0) {
        ganttContainer.innerHTML = '<p class="empty-message">Carga un archivo Excel para ver el gráfico Gantt</p>';
        return;
    }
    
    // Obtener todos los trabajos asignados con sus fechas
    const trabajosConFechasGantt = [];
    
    for (const [fechaStr, indices] of trabajosConFechas.entries()) {
        indices.forEach(indice => {
            const trabajo = trabajos[indice];
            const fechaInicioTrabajo = normalizarFecha(fechaStr);
            
            // Obtener fecha de finalización
            let fechaFinTrabajo = null;
            if (fechasFinTrabajos.has(indice)) {
                fechaFinTrabajo = fechasFinTrabajos.get(indice);
            } else if (trabajo['Validez a']) {
                fechaFinTrabajo = normalizarFecha(trabajo['Validez a']);
            }
            
            // Si no hay fecha de fin, usar el día siguiente de inicio
            if (!fechaFinTrabajo && fechaInicioTrabajo) {
                const fechaInicioDate = new Date(fechaInicioTrabajo);
                fechaInicioDate.setDate(fechaInicioDate.getDate() + 1);
                const ano = fechaInicioDate.getFullYear();
                const mes = String(fechaInicioDate.getMonth() + 1).padStart(2, '0');
                const dia = String(fechaInicioDate.getDate()).padStart(2, '0');
                fechaFinTrabajo = `${ano}-${mes}-${dia}`;
            }
            
            if (fechaInicioTrabajo) {
                trabajosConFechasGantt.push({
                    indice,
                    trabajo,
                    fechaInicio: fechaInicioTrabajo,
                    fechaFin: fechaFinTrabajo || fechaInicioTrabajo,
                    hora: obtenerHoraTrabajo(indice)
                });
            }
        });
    }
    
    if (trabajosConFechasGantt.length === 0) {
        ganttContainer.innerHTML = '<p class="empty-message">No hay trabajos asignados a fechas para mostrar en el Gantt</p>';
        return;
    }
    
    // Ordenar por fecha de inicio
    trabajosConFechasGantt.sort((a, b) => {
        const fechaA = new Date(a.fechaInicio);
        const fechaB = new Date(b.fechaInicio);
        return fechaA - fechaB;
    });
    
    // Calcular rango de fechas para el gráfico
    const fechasInicio = trabajosConFechasGantt.map(t => new Date(t.fechaInicio));
    const fechasFin = trabajosConFechasGantt.map(t => new Date(t.fechaFin));
    const fechaMin = new Date(Math.min(...fechasInicio));
    const fechaMax = new Date(Math.max(...fechasFin));
    
    // Ajustar al rango de fechas seleccionado si existe
    const fechaInicioStr = fechaInicio.value;
    const fechaFinStr = fechaFin.value;
    if (fechaInicioStr && fechaFinStr) {
        const inicioSeleccionado = new Date(fechaInicioStr);
        const finSeleccionado = new Date(fechaFinStr);
        if (inicioSeleccionado < fechaMin) fechaMin.setTime(inicioSeleccionado.getTime());
        if (finSeleccionado > fechaMax) fechaMax.setTime(finSeleccionado.getTime());
    }
    
    // Generar array de fechas para el timeline
    const fechasTimeline = [];
    const fechaActual = new Date(fechaMin);
    while (fechaActual <= fechaMax) {
        fechasTimeline.push(new Date(fechaActual));
        fechaActual.setDate(fechaActual.getDate() + 1);
    }
    
    // Crear HTML del Gantt
    let html = '<div class="gantt-header">';
    html += '<div class="gantt-header-left">Trabajo</div>';
    html += '<div class="gantt-header-right">';
    
    fechasTimeline.forEach(fecha => {
        const esFinDeSemana = fecha.getDay() === 0 || fecha.getDay() === 6;
        const esHoy = formatearFecha(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) === 
                     formatearFecha(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
        let clase = '';
        if (esHoy) clase = 'today';
        else if (esFinDeSemana) clase = 'weekend';
        
        const diaSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][fecha.getDay()];
        html += `<div class="gantt-date-header ${clase}">${diaSemana}<br>${fecha.getDate()}/${fecha.getMonth() + 1}</div>`;
    });
    
    html += '</div></div>';
    
    // Crear filas de trabajos
    trabajosConFechasGantt.forEach(({ indice, trabajo, fechaInicio: fechaIni, fechaFin: fechaF, hora }) => {
        // Normalizar fechas para comparación
        const fechaIniStr = fechaIni.split('T')[0];
        const fechaFinStr = fechaF.split('T')[0];
        
        // Encontrar el índice de la fecha de inicio y fin en el timeline
        let indiceInicio = -1;
        let indiceFin = -1;
        
        fechasTimeline.forEach((fecha, index) => {
            const fechaStr = formatearFecha(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
            if (fechaStr === fechaIniStr && indiceInicio === -1) {
                indiceInicio = index;
            }
            if (fechaStr === fechaFinStr) {
                indiceFin = index;
            }
        });
        
        // Si no encontramos la fecha exacta, buscar la más cercana
        if (indiceInicio === -1) {
            for (let i = 0; i < fechasTimeline.length; i++) {
                const fechaStr = formatearFecha(fechasTimeline[i].getFullYear(), fechasTimeline[i].getMonth(), fechasTimeline[i].getDate());
                if (fechaStr >= fechaIniStr) {
                    indiceInicio = i;
                    break;
                }
            }
            if (indiceInicio === -1) indiceInicio = 0;
        }
        
        if (indiceFin === -1) {
            for (let i = fechasTimeline.length - 1; i >= 0; i--) {
                const fechaStr = formatearFecha(fechasTimeline[i].getFullYear(), fechasTimeline[i].getMonth(), fechasTimeline[i].getDate());
                if (fechaStr <= fechaFinStr) {
                    indiceFin = i;
                    break;
                }
            }
            if (indiceFin === -1) indiceFin = fechasTimeline.length - 1;
        }
        
        // Calcular duración en días (incluyendo el día de inicio y fin)
        const duracion = indiceFin - indiceInicio + 1;
        
        // Calcular posición y ancho basado en el ancho fijo de cada celda (60px)
        const anchoCelda = 60;
        const posicionPx = indiceInicio * anchoCelda;
        const anchoPx = duracion * anchoCelda;
        const anchoTotalTimeline = fechasTimeline.length * anchoCelda;
        
        const posicionPorcentaje = (posicionPx / anchoTotalTimeline) * 100;
        const anchoPorcentaje = (anchoPx / anchoTotalTimeline) * 100;
        
        // Obtener texto breve
        let textoBreve = trabajo['Texto breve'] || `Trabajo ${indice + 1}`;
        textoBreve = textoBreve.replace(/^HGPIe:\s*/i, '');
        
        // Obtener estado del permiso
        const estadoPermiso = estadosPermisos.get(indice) || 'SOLICITADO';
        const claseEstado = `estado-${estadoPermiso.toLowerCase()}`;
        
        html += '<div class="gantt-row">';
        html += '<div class="gantt-row-label">';
        html += `<div class="gantt-row-label-title">${textoBreve}</div>`;
        html += `<div class="gantt-row-label-meta">${fechaIni} - ${fechaF} | ${hora} | ${estadoPermiso}</div>`;
        html += '</div>';
        html += '<div class="gantt-row-timeline">';
        
        // Añadir celdas del timeline
        fechasTimeline.forEach(fecha => {
            const esFinDeSemana = fecha.getDay() === 0 || fecha.getDay() === 6;
            const esHoy = formatearFecha(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) === 
                         formatearFecha(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
            let clase = '';
            if (esHoy) clase = 'today';
            else if (esFinDeSemana) clase = 'weekend';
            html += `<div class="gantt-timeline-cell ${clase}"></div>`;
        });
        
        // Añadir barra del trabajo usando píxeles para mayor precisión con clase de estado
        html += `<div class="gantt-bar ${claseEstado}" style="left: ${posicionPx}px; width: ${anchoPx}px;" title="${textoBreve} - ${fechaIni} a ${fechaF} - ${estadoPermiso}">${textoBreve.substring(0, 20)}${textoBreve.length > 20 ? '...' : ''}</div>`;
        
        html += '</div></div>';
    });
    
    ganttContainer.innerHTML = html;
    
    // Sincronizar el scroll del header con el contenido y asegurar mismo ancho
    setTimeout(() => {
        const ganttSection = ganttContainer.closest('.gantt-section');
        const headerRight = ganttContainer.querySelector('.gantt-header-right');
        const rowsTimeline = ganttContainer.querySelectorAll('.gantt-row-timeline');
        
        if (ganttSection && headerRight && rowsTimeline.length > 0) {
            // Calcular el ancho total del timeline (número de días * 60px)
            const anchoTotalTimeline = fechasTimeline.length * 60;
            
            // Asegurar que el header y las filas tengan el mismo ancho
            headerRight.style.width = `${anchoTotalTimeline}px`;
            headerRight.style.minWidth = `${anchoTotalTimeline}px`;
            headerRight.style.flexShrink = '0';
            
            rowsTimeline.forEach(rowTimeline => {
                rowTimeline.style.width = `${anchoTotalTimeline}px`;
                rowTimeline.style.minWidth = `${anchoTotalTimeline}px`;
                rowTimeline.style.flexShrink = '0';
            });
            
            // Sincronizar scroll horizontal del header con el contenedor
            ganttSection.addEventListener('scroll', () => {
                headerRight.scrollLeft = ganttSection.scrollLeft;
            });
        }
    }, 0);
}
