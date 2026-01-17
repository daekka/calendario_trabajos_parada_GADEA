// Función para manejar la carga del archivo Excel
function handleFileUpload(event) {
    if (typeof XLSX === 'undefined') {
        alert('Error crítica: La librería SheetJS no está cargada. Revise la conexión a internet o el archivo index.html');
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    // Ocultar info de nube si subimos archivo local
    if (infoDatosNube) {
        infoDatosNube.style.display = 'none';
        infoDatosNube.textContent = '';
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            // Leer Excel SIN convertir fechas (raw numbers) para manejar seriales de Excel manualmente
            const workbook = XLSX.read(data, { type: 'array', cellDates: false });
            
            // Leer la primera hoja
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convertir a JSON manteniendo valores raw (números seriales de Excel para fechas)
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });
            
            if (jsonData.length < 2) {
                alert('El archivo Excel está vacío o no tiene datos válidos');
                return;
            }

            // La primera fila son los encabezados
            const headers = jsonData[0];
            
            // DEBUG: Mostrar headers y primeras filas para depuración
            console.log('=== DEPURACIÓN EXCEL ===');
            console.log('Headers encontrados:', headers);
            console.log('Número de filas:', jsonData.length);
            if (jsonData.length > 1) {
                console.log('Primera fila de datos:', jsonData[1]);
            }
            if (jsonData.length > 2) {
                console.log('Segunda fila de datos:', jsonData[2]);
            }
            
            // Validar que las columnas coincidan (aproximadamente)
            if (!validarColumnas(headers)) {
                alert('Las columnas del archivo no coinciden con el formato esperado');
                return;
            }

            // Guardar la carga cruda para poder subirla a la nube tal cual
            ultimoJsonData = jsonData;
            // Procesar los datos
            procesarDatos(jsonData);
            
            // Distribuir trabajos según fechas de parada
            distribuirTrabajos();
            
            // (Gantt eliminado)
            
            // Actualizar estadísticas
            actualizarEstadisticasTrabajos();
            
            // Habilitar botón de exportar (sidebar y top)
            exportBtn.disabled = false;
            if (exportBtnTop) exportBtnTop.disabled = false;
            
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
    // Limpiar mapa de solicitudes que empiezan por '4' al procesar nuevo archivo
    solicitudes4PorTexto.clear();
    
    const headers = jsonData[0];
    
    // DEBUG: Mostrar todos los headers
    console.log('=== HEADERS DEL EXCEL ===');
    headers.forEach((h, idx) => {
        console.log(`  Columna ${idx}: "${h}"`);
    });
    
    // Buscar índices de las columnas
    const indiceValidoDe = headers.findIndex(h => 
        h && h.toString().trim() === 'Válido de'
    );
    const indiceHoraInicio = headers.findIndex(h => 
        h && h.toString().trim() === 'Hora inicio validez'
    );
    const indiceStatusUsuario = headers.findIndex(h => 
        h && h.toString().trim() === 'Status de usuario'
    );
    
    console.log('Índice "Válido de":', indiceValidoDe);
    console.log('Índice "Hora inicio validez":', indiceHoraInicio);
    
    // DEBUG: Mostrar valores de las primeras filas para esas columnas
    if (jsonData.length > 1) {
        console.log('=== VALORES DE HORA EN PRIMERAS FILAS ===');
        for (let i = 1; i < Math.min(6, jsonData.length); i++) {
            const row = jsonData[i];
            console.log(`Fila ${i}: Válido de="${row[indiceValidoDe]}" (tipo: ${typeof row[indiceValidoDe]}), Hora="${row[indiceHoraInicio]}" (tipo: ${typeof row[indiceHoraInicio]})`);
        }
    }
    
    // NUEVO: Buscar índice de Creado por
    const indiceCreadoPor = headers.findIndex(h => 
        h && h.toString().trim() === 'Creado por'
    );
    // Buscar índice de Texto breve (para mapear solicitudes que empiezan por '4')
    const indiceTextoBreve = headers.findIndex(h => 
        h && h.toString().trim() === 'Texto breve'
    );
    // NUEVO: Buscar índice de Solicitud para filtrar
    const indiceSolicitud = headers.findIndex(h => 
        h && h.toString().trim() === 'Solicitud'
    );
    // NUEVO: Buscar índice de Utilización para detectar descargos
    const indiceUtilizacion = headers.findIndex(h => 
        h && h.toString().trim() === 'Utilización'
    );
    
    // DEBUG: Mostrar información sobre la columna Utilización
    console.log('=== DEPURACIÓN UTILIZACIÓN ===');
    console.log('Headers encontrados:', headers);
    console.log('Índice columna Utilización:', indiceUtilizacion);
    if (indiceUtilizacion === -1) {
        console.log('⚠️ COLUMNA "Utilización" NO ENCONTRADA. Buscando columnas similares...');
        headers.forEach((h, idx) => {
            if (h && h.toString().toLowerCase().includes('util')) {
                console.log(`  Posible columna similar en índice ${idx}: "${h}"`);
            }
        });
    }
    
    // Procesar cada fila (empezando desde la fila 1, ya que 0 son los headers)
    for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;
        
        // Filtrar trabajos cuya Solicitud empieza por "4" -> registrar en mapa y no incluir en "trabajos"
        if (indiceSolicitud !== -1) {
            const solicitud = String(row[indiceSolicitud] || '').trim();
            if (solicitud.startsWith('4')) {
                // Obtener texto breve para agrupar
                let textoBr = '';
                if (indiceTextoBreve !== -1) {
                    textoBr = String(row[indiceTextoBreve] || '').trim();
                }
                const clave = textoBr.replace(/^HGPIe:\s*/i, '').trim().toLowerCase();
                if (!solicitudes4PorTexto.has(clave)) {
                    solicitudes4PorTexto.set(clave, []);
                }
                const arr = solicitudes4PorTexto.get(clave);
                if (!arr.includes(solicitud)) arr.push(solicitud);
                // No añadir a trabajos (comportamiento original)
                continue;
            }
        }
        
        // Crear objeto trabajo con todos los campos
        const trabajo = {};
        headers.forEach((header, index) => {
            if (header) {
                trabajo[header] = row[index] || '';
            }
        });
        
        // NUEVO: Determinar Tipo de Mantenimiento y Clase CSS
        const creadoPor = indiceCreadoPor !== -1 ? String(row[indiceCreadoPor] || '').trim() : '';
        const mapping = MTO_MAPPING[creadoPor] || MTO_MAPPING['DEFAULT'];
        trabajo.tipoMantenimiento = mapping.id;
        trabajo.claseTipo = mapping.clase;
        
        // NUEVO: Detectar si requiere descargo (Utilización = YU1)
        const utilizacion = indiceUtilizacion !== -1 ? String(row[indiceUtilizacion] || '').trim().toUpperCase() : '';
        trabajo.requiereDescargo = (utilizacion === 'YU1');
        
        // DEBUG: Mostrar valores de Utilización en primeros trabajos
        if (trabajos.length < 10 && indiceUtilizacion !== -1) {
            console.log(`Trabajo ${trabajos.length + 1} - Utilización: "${row[indiceUtilizacion]}" -> "${utilizacion}" -> requiereDescargo: ${trabajo.requiereDescargo}`);
        }

        // Añadir índice para referencia
        trabajo._indice = trabajos.length;
        trabajos.push(trabajo);
        
        // Guardar valor original de "Válido de"
        const valorValidoDe = indiceValidoDe !== -1 ? (row[indiceValidoDe] || '') : '';
        valoresOriginalesValidoDe.set(trabajo._indice, valorValidoDe);
        
        // DEBUG: Mostrar información de fechas de primeros trabajos
        if (trabajos.length <= 5) {
            console.log(`=== DEPURACIÓN FECHA Trabajo ${trabajos.length} ===`);
            console.log('  Valor original "Válido de":', valorValidoDe);
            console.log('  Tipo de dato:', typeof valorValidoDe);
            console.log('  Es Date?:', valorValidoDe instanceof Date);
            console.log('  Normalizada:', normalizarFecha(valorValidoDe));
        }
        
        // DEBUG: Mostrar primeros trabajos procesados
        if (trabajos.length <= 3) {
            console.log(`Trabajo ${trabajos.length}:`, {
                orden: trabajo['Orden'],
                textoBrve: trabajo['Texto breve'],
                validoDe: valorValidoDe,
                validoDeNormalizado: normalizarFecha(valorValidoDe),
                creadoPor: trabajo['Creado por'],
                tipoMto: trabajo.tipoMantenimiento
            });
        }
        
        // Cargar estado desde Status de usuario
        if (indiceStatusUsuario !== -1) {
            const status = String(row[indiceStatusUsuario] || '').trim().toUpperCase();
            if (status === 'AUTO') {
                estadosPermisos.set(trabajo._indice, 'AUTORIZADO');
            } else if (status === 'APRO') {
                estadosPermisos.set(trabajo._indice, 'APROBADO');
            } else {
                estadosPermisos.set(trabajo._indice, 'PENDIENTE');
            }
        } else {
            estadosPermisos.set(trabajo._indice, 'PENDIENTE');
        }
    }
}

// Distribuir trabajos entre listado y calendario según las fechas de la parada
function distribuirTrabajos() {
    trabajosConFechas.clear();
    trabajosAsignados.clear();
    
    // Obtener fechas de la parada
    const fechaInicioStr = fechaInicio.value;
    const fechaFinStr = fechaFin.value;
    
    // Si no hay rango de parada definido, dejar todo sin asignar (en listado)
    if (!fechaInicioStr || !fechaFinStr) {
        mostrarTrabajos();
        generarCalendario();
        return;
    }
    
    // No necesitamos convertir a Date para comparaciones de string YYYY-MM-DD si el formato es consistente,
    // pero para seguridad en comparaciones:
    
    trabajos.forEach(trabajo => {
        // Obtenemos la fecha ORIGINAL del trabajo (no modificada)
        // El requisito es re-evaluar la asignación basada en si CAEN DENTRO O NO.
        // Si el usuario modificó la fecha, ¿deberíamos respetar su modificación o la fecha original?
        // Asumiendo que "distribuir" es una operación de reset basada en criterio.
        // Pero si el usuario ya movió cosas en la herramienta, esas modificaciones están en "fechasFinTrabajos" o implícitas en "trabajosConFechas"?
        // No, el drag & drop actualiza "trabajosConFechas".
        // Vamos a usar la fecha ORIGINAL de "Válido de" para la distribución automática.
        
        const valorValidoDe = valoresOriginalesValidoDe.get(trabajo._indice);
        const fechaStr = normalizarFecha(valorValidoDe);
        
        if (fechaStr) {
            // Manejar múltiples fechas separadas por coma
            const fechas = fechaStr.split(',').map(f => f.trim()).filter(f => f);
            
            fechas.forEach(unaFecha => {
                // Verificar si la fecha cae dentro del rango de parada [fechaInicioStr, fechaFinStr]
                // Comparación lexicográfica funciona para formato YYYY-MM-DD
                if (unaFecha >= fechaInicioStr && unaFecha <= fechaFinStr) {
                    // DENTRO -> Asignar al calendario
                    if (!trabajosConFechas.has(unaFecha)) {
                        trabajosConFechas.set(unaFecha, []);
                    }
                    const lista = trabajosConFechas.get(unaFecha);
                    if (!lista.includes(trabajo._indice)) {
                        lista.push(trabajo._indice);
                    }
                    trabajosAsignados.add(trabajo._indice);
                    
                    // Nota: No marcamos como modificado porque es la asignación automática original
                }
                // FUERA -> No hacer nada, se queda en el listado (sin asignar)
            });
        }
    });

    // Refrescar la interfaz
    mostrarTrabajos();
    generarCalendario();
}

// Normalizar fecha a formato YYYY-MM-DD
function normalizarFecha(fecha) {
    if (!fecha) return null;
    
    // Si ya está en formato YYYY-MM-DD
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
        return fecha.split(' ')[0]; // Tomar solo la parte de la fecha si hay hora
    }
    
    // Si es un objeto Date (de Excel con cellDates: true)
    if (fecha instanceof Date) {
        // Usar UTC para evitar problemas de zona horaria
        const ano = fecha.getUTCFullYear();
        const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getUTCDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
    
    // Si es un número (serial de Excel) - CASO PRINCIPAL
    if (typeof fecha === 'number') {
        // Los seriales de Excel para fechas típicamente son > 1 (días desde 1900)
        // Si el número es muy pequeño (< 1), podría ser solo hora
        if (fecha < 1) {
            console.warn('Valor de fecha es solo hora (< 1):', fecha);
            return null;
        }
        
        // Convertir serial de Excel a fecha JavaScript
        // Excel cuenta desde 1 de enero de 1900, pero tiene un bug con el año bisiesto 1900
        // La fórmula: (serial - 25569) * 86400 * 1000 convierte a timestamp Unix
        // 25569 = días entre 1/1/1900 y 1/1/1970 (epoch Unix)
        const fechaExcel = new Date(Math.round((fecha - 25569) * 86400 * 1000));
        const ano = fechaExcel.getUTCFullYear();
        const mes = String(fechaExcel.getUTCMonth() + 1).padStart(2, '0');
        const dia = String(fechaExcel.getUTCDate()).padStart(2, '0');
        
        // Validar que el año sea razonable (entre 2000 y 2100)
        if (ano >= 2000 && ano <= 2100) {
            return `${ano}-${mes}-${dia}`;
        } else {
            console.warn('Fecha fuera de rango razonable:', fecha, '->', `${ano}-${mes}-${dia}`);
            return null;
        }
    }
    
    // Intentar parsear como string
    if (typeof fecha === 'string') {
        // Limpiar el string
        fecha = fecha.trim();
        
        // Si parece ser solo hora (HH:MM:SS), ignorar
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(fecha)) {
            console.warn('Valor es solo hora, no fecha:', fecha);
            return null;
        }
        
        // Intentar diferentes formatos
        // YYYY-MM-DD
        let match = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return `${match[1]}-${match[2]}-${match[3]}`;
        }
        
        // DD/MM/YYYY (formato español)
        match = fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (match) {
            return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
        }
        
        // DD.MM.YYYY (formato alemán)
        match = fecha.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (match) {
            return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
        }
        
        // YYYY/MM/DD
        match = fecha.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
        if (match) {
            return `${match[1]}-${match[2]}-${match[3]}`;
        }
        
        // DD-MM-YYYY
        match = fecha.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
        if (match) {
            return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
        }
        
        // MM/DD/YYYY (formato americano) - intentar detectar
        match = fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (match) {
            const num1 = parseInt(match[1]);
            const num2 = parseInt(match[2]);
            let ano = match[3];
            if (ano.length === 2) ano = '20' + ano;
            
            // Si el primer número > 12, es DD/MM/YYYY
            if (num1 > 12) {
                return `${ano}-${String(num2).padStart(2, '0')}-${String(num1).padStart(2, '0')}`;
            }
            // Si el segundo número > 12, es MM/DD/YYYY
            else if (num2 > 12) {
                return `${ano}-${String(num1).padStart(2, '0')}-${String(num2).padStart(2, '0')}`;
            }
            // Ambiguo - asumir DD/MM/YYYY (formato español)
            else {
                return `${ano}-${String(num2).padStart(2, '0')}-${String(num1).padStart(2, '0')}`;
            }
        }
        
        // Intentar parsear con Date como último recurso (usar UTC)
        const fechaParsed = new Date(fecha);
        if (!isNaN(fechaParsed.getTime())) {
            const ano = fechaParsed.getUTCFullYear();
            const mes = String(fechaParsed.getUTCMonth() + 1).padStart(2, '0');
            const dia = String(fechaParsed.getUTCDate()).padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
        }
    }
    
    console.warn('No se pudo normalizar la fecha:', fecha, 'Tipo:', typeof fecha);
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
    
    // Filtrar trabajos: solo mostrar los que NO han sido asignados y cumplen filtro de tipo y texto
    const trabajosFiltrados = trabajos.filter((trabajo, index) => {
        const noAsignado = !trabajosAsignados.has(trabajo._indice);
        
        // Filtro por tipo de mantenimiento
        const cumpleFiltroTipo = filtroTipos.has('TODOS') || filtroTipos.has(trabajo.tipoMantenimiento);
        
        // Filtro por texto en "Texto breve"
        let cumpleFiltroTexto = true;
        if (filtroTextoActivo && filtroTextoValor.trim() !== '') {
            const textoBreve = (trabajo['Texto breve'] || '').toLowerCase();
            const textoBuscar = filtroTextoValor.toLowerCase();
            cumpleFiltroTexto = textoBreve.includes(textoBuscar);
        }
        
        return noAsignado && cumpleFiltroTipo && cumpleFiltroTexto;
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
        
        // NUEVO: Añadir clase específica del tipo
        if (trabajo.claseTipo) {
            trabajoItem.classList.add(trabajo.claseTipo);
        }
        
        // Añadir clase si requiere descargo
        if (trabajo.requiereDescargo) {
            trabajoItem.classList.add('requiere-descargo');
        }
        
        trabajoItem.draggable = true;
        trabajoItem.dataset.indice = trabajo._indice; // Usar el índice original del trabajo
        
        // Obtener texto breve y eliminar prefijo "HGPIe: " si existe
        let textoBreve = trabajo['Texto breve'] || `Trabajo ${trabajo._indice + 1}`;
        //textoBreve = textoBreve.replace(/^HGPIe:\s*/i, ''); // Eliminar prefijo (case insensitive)
        
        // Añadir icono de descargo si aplica y crear contenido principal
        const partesContenido = [];
        if (trabajo.requiereDescargo) {
            partesContenido.push(`<span class="descargo-icon" title="Requiere acciones de aislamiento">🔒</span>`);
        }
        partesContenido.push(`<span class="texto-breve">${textoBreve}</span>`);

        // Añadir icono-link que abrirá la orden en una pestaña nueva
        const ordenParaUrl = (trabajo['Orden'] || '').toString().padStart(12, '0');
        const urlOrden = construirUrlOrden(ordenParaUrl);
        const linkIconHtml = `<a href="${urlOrden}" target="_blank" rel="noopener noreferrer" class="orden-link" title="Abrir orden ${ordenParaUrl}">🔗</a>`;
        partesContenido.push(linkIconHtml);

        // Añadir icono-link para la Solicitud
        const solicitudParaUrlList = (trabajo['Solicitud'] || '').toString().padStart(12, '0');
        const urlSolicitudList = construirUrlSolicitud(solicitudParaUrlList);
        const linkSolicitudHtml = `<a href="${urlSolicitudList}" target="_blank" rel="noopener noreferrer" class="solicitud-link" title="Abrir solicitud ${solicitudParaUrlList}">📎</a>`;
        partesContenido.push(linkSolicitudHtml);

        trabajoItem.innerHTML = partesContenido.join(' ');
        
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
    
    // (Gantt eliminado) -- no hay acción aquí
    
    // Actualizar estadísticas
    actualizarEstadisticasTrabajos();
}


