// Estado de la aplicación
let trabajos = []; // Array con todos los datos de trabajos
let trabajosConFechas = new Map(); // Map: fecha (string) -> array de índices de trabajos
let trabajosAsignados = new Set(); // Set de índices de trabajos que han sido asignados a alguna fecha
let trabajosModificados = new Set(); // Set de índices de trabajos cuya fecha ha sido modificada
let valoresOriginalesValidoDe = new Map(); // Map: índice -> valor original de "Válido de"
let horasTrabajos = new Map(); // Map: índice -> hora (string) para almacenar horas modificadas

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

// Event listeners
fileInput.addEventListener('change', handleFileUpload);
exportBtn.addEventListener('click', exportarExcel);
if (actualizarCalendarioBtn) {
    actualizarCalendarioBtn.addEventListener('click', actualizarCalendario);
}

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
    
    const headers = jsonData[0];
    
    // Buscar índices de las columnas
    const indiceValidoDe = headers.findIndex(h => 
        h && h.toString().trim() === 'Válido de'
    );
    const indiceActualizadaFecha = headers.findIndex(h => 
        h && (h.toString().trim() === 'Actualizada fecha' || h.toString().trim() === 'Actualizada Fecha')
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
}

// Generar calendarios basado en las fechas seleccionadas
function generarCalendario() {
    calendarioContainer.innerHTML = '';
    
    // Obtener fechas de los inputs
    const fechaInicioStr = fechaInicio.value;
    const fechaFinStr = fechaFin.value;
    
    if (!fechaInicioStr || !fechaFinStr) {
        // Valores por defecto si no hay fechas
        const enero = generarMesCalendario(2026, 0, 16, 31);
        calendarioContainer.appendChild(enero);
        const febrero = generarMesCalendario(2026, 1, 1, 16);
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
    
    // Generar calendarios para cada mes
    meses.forEach(({ ano, mes, diaInicio, diaFin }) => {
        const mesCalendario = generarMesCalendario(ano, mes, diaInicio, diaFin);
        calendarioContainer.appendChild(mesCalendario);
    });
}

// Actualizar calendario cuando cambien las fechas
function actualizarCalendario() {
    generarCalendario();
}

// Generar un mes del calendario
// diaInicio y diaFin: rango de días a mostrar (null = todos los días del mes)
function generarMesCalendario(ano, mes, diaInicio = null, diaFin = null) {
    const contenedorMes = document.createElement('div');
    contenedorMes.className = 'mes-calendario';
    
    // Nombre del mes
    const nombresMeses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    const mesHeader = document.createElement('div');
    mesHeader.className = 'mes-header';
    mesHeader.textContent = `${nombresMeses[mes]} ${ano}`;
    contenedorMes.appendChild(mesHeader);
    
    // Días de la semana (empezando en lunes)
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
    
    // Días del mes anterior (relleno) - solo si no empezamos desde el lunes
    if (diaSemanaInicio > 0) {
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
    }
    
    // Días del mes actual (solo el rango especificado)
    for (let dia = primerDiaAMostrar; dia <= ultimoDiaAMostrar; dia++) {
        const diaElement = document.createElement('div');
        diaElement.className = 'dia-calendario';
        
        const fechaStr = formatearFecha(ano, mes, dia);
        diaElement.dataset.fecha = fechaStr;
        
        const numeroDia = document.createElement('div');
        numeroDia.className = 'numero-dia';
        numeroDia.textContent = dia;
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
    
    // Días del mes siguiente (relleno hasta completar semanas completas)
    const totalCeldas = diasMes.children.length;
    const semanasCompletas = Math.ceil(totalCeldas / 7);
    const celdasNecesarias = semanasCompletas * 7;
    const celdasRestantes = celdasNecesarias - totalCeldas;
    
    for (let dia = 1; dia <= celdasRestantes; dia++) {
        const diaElement = document.createElement('div');
        diaElement.className = 'dia-calendario otro-mes';
        diaElement.textContent = dia;
        diasMes.appendChild(diaElement);
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
        
        // Evento de clic derecho para editar hora
        trabajoElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            mostrarEditorHora(indice, trabajoElement, hora);
        });
        
        contenedor.appendChild(trabajoElement);
    });
}

// Mostrar editor de hora
function mostrarEditorHora(indice, elemento, horaActual) {
    // Crear modal/editor de hora
    const editor = document.createElement('div');
    editor.className = 'editor-hora';
    editor.innerHTML = `
        <div class="editor-hora-contenido">
            <h3>Editar hora de inicio</h3>
            <input type="time" id="horaInput" value="${horaActual}" class="hora-input" />
            <div class="editor-hora-botones">
                <button class="btn-guardar-hora">Guardar</button>
                <button class="btn-cancelar-hora">Cancelar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(editor);
    
    const horaInput = editor.querySelector('#horaInput');
    const btnGuardar = editor.querySelector('.btn-guardar-hora');
    const btnCancelar = editor.querySelector('.btn-cancelar-hora');
    
    // Posicionar el editor cerca del elemento
    const rect = elemento.getBoundingClientRect();
    editor.style.top = `${rect.bottom + 5}px`;
    editor.style.left = `${rect.left}px`;
    
    // Guardar hora
    btnGuardar.addEventListener('click', () => {
        const nuevaHora = normalizarHora(horaInput.value);
        horasTrabajos.set(indice, nuevaHora);
        
        // Actualizar visualización
        const fechaOrigen = elemento.dataset.fechaOrigen;
        if (fechaOrigen) {
            const contenedor = elemento.closest('.trabajos-dia');
            if (contenedor) {
                mostrarTrabajosEnDia(contenedor, fechaOrigen);
            }
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
    
    // Enfocar el input
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
        
        // Añadir encabezados (columnas originales + nueva columna)
        const headers = COLUMNAS_ESPERADAS.slice();
        headers.push('Actualizada fecha');
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
                
                fila.push(valor);
            });
            
            // Añadir campo "Actualizada fecha" (Sí/No)
            const actualizadaFecha = trabajosModificados.has(indice) ? 'Sí' : 'No';
            fila.push(actualizadaFecha);
            
            datosExportar.push(fila);
        });
        
        // Crear workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(datosExportar);
        
        // Ajustar ancho de columnas
        const colWidths = COLUMNAS_ESPERADAS.map(() => ({ wch: 15 }));
        colWidths.push({ wch: 15 }); // Para la columna "Actualizada fecha"
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
