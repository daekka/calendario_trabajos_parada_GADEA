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
        
        // (Gantt eliminado)
        
        // Actualizar estadísticas
        actualizarEstadisticasTrabajos();
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

// Función auxiliar para obtener datos completos (para Exportar y para Subir a Nube)
function obtenerDatosCompletos() {
    if (trabajos.length === 0) {
        return null;
    }
    
    // Crear array de datos para exportar
    const datosExportar = [];
    
    // Añadir encabezados (columnas originales + nuevas columnas)
    const headers = COLUMNAS_ESPERADAS.slice();
    headers.push('Actualizada fecha');
    headers.push('Estado permiso');
    headers.push('Requiere Descargo');
    datosExportar.push(headers);
    
    // Procesar cada trabajo
    trabajos.forEach((trabajo, indice) => {
        const fila = [];
        
        // Añadir todos los campos originales en el orden esperado
        COLUMNAS_ESPERADAS.forEach((columna, colIndex) => {
            let valor = trabajo[columna] || '';
            
            // Normalizar fechas a formato DD/MM/YYYY para exportación
            if (columna === 'Válido de' || columna === 'Validez a' || columna === 'Fecha de creación') {
                // Primero normalizar a YYYY-MM-DD, luego convertir a DD/MM/YYYY
                const fechaNorm = normalizarFecha(valor);
                if (fechaNorm) {
                    const [ano, mes, dia] = fechaNorm.split('-');
                    valor = `${dia}/${mes}/${ano}`;
                }
            }
            
            // Si es la columna "Válido de", actualizar con la fecha asignada
            if (columna === 'Válido de') {
                const fechaAsignada = obtenerFechaTrabajo(indice);
                if (fechaAsignada) {
                    // fechaAsignada viene en formato YYYY-MM-DD, convertir a DD/MM/YYYY
                    const partes = fechaAsignada.split('-');
                    if (partes.length === 3) {
                        valor = `${partes[2]}/${partes[1]}/${partes[0]}`;
                    } else {
                        valor = fechaAsignada;
                    }
                }
            }
            
            // Si es la columna "Hora inicio validez", usar la hora modificada si existe
            if (columna === 'Hora inicio validez') {
                if (horasTrabajos.has(indice)) {
                    valor = horasTrabajos.get(indice);
                }
                // Mantener valor original, sin forzar 07:00
            }
            
            // Si es la columna "Validez a", usar la fecha modificada si existe
            if (columna === 'Validez a') {
                if (fechasFinTrabajos.has(indice)) {
                    const fechaFin = fechasFinTrabajos.get(indice);
                    // Convertir de YYYY-MM-DD a DD/MM/YYYY
                    const partes = fechaFin.split('-');
                    if (partes.length === 3) {
                        valor = `${partes[2]}/${partes[1]}/${partes[0]}`;
                    } else {
                        valor = fechaFin;
                    }
                }
            }
            
            fila.push(valor);
        });
        
        // Añadir campo "Actualizada fecha" (Sí/No)
        const actualizadaFecha = trabajosModificados.has(indice) ? 'Sí' : 'No';
        fila.push(actualizadaFecha);
        
        // Añadir campo "Estado permiso"
        const estadoPermiso = estadosPermisos.get(indice) || 'PENDIENTE';
        fila.push(estadoPermiso);
        
        // Añadir campo "Requiere Descargo" (Sí/No) basado en Utilización = YU1
        const requiereDescargo = trabajo.requiereDescargo === true ? 'Sí' : 'No';
        fila.push(requiereDescargo);

        // Añadir columna con aislamientos concatenados (si existen)
        const solicitudClave = String(trabajo['Solicitud'] || '').trim();
        const aislamientosArr = aislamientosPorSolicitud.get(solicitudClave) || [];
        const aislamientosStr = aislamientosArr.map(a => `${a.numero}: ${a.descripcion} [${a.estados}]`).join(' | ');
        fila.push(aislamientosStr);

        datosExportar.push(fila);
    });
    
    return datosExportar;
}

// Exportar a Excel
function exportarExcel() {
    try {
        const datosExportar = obtenerDatosCompletos();
        if (!datosExportar) {
            alert('No hay trabajos para exportar');
            return;
        }

        // Crear workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(datosExportar);
        
        // Ajustar ancho de columnas
        const colWidths = COLUMNAS_ESPERADAS.map(() => ({ wch: 15 }));
        colWidths.push({ wch: 15 }); // Para la columna "Actualizada fecha"
        colWidths.push({ wch: 15 }); // Para la columna "Estado permiso"
        colWidths.push({ wch: 18 }); // Para la columna "Requiere Descargo"
        colWidths.push({ wch: 40 }); // Para la columna "Aislamientos"
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

// Subir datos a Supabase
async function subirDatosSupabase() {
    if (!supabaseClient) { 
        alert('Supabase no configurado correctamente. Verifique las credenciales en el código.'); 
        return; 
    }
    
    const password = prompt("Ingrese clave de acceso para subir datos:");
    if (password !== "uf183530") {
        alert("Clave incorrecta. Acceso denegado.");
        return;
    }

    // Preferir subir la carga cruda si está disponible (preserva filas con Solicitud que empiezan por '4')
    let datos = null;
    if (ultimoJsonData) {
        datos = ultimoJsonData;
    } else {
        datos = obtenerDatosCompletos();
    }
    if (!datos) { 
        alert('No hay datos para subir'); 
        return; 
    }

    try {
        // Mostrar indicador de carga
        const btnTexto = uploadSupabaseBtn.innerText;
        uploadSupabaseBtn.innerText = 'Subiendo...';
        uploadSupabaseBtn.disabled = true;

        // Preparar payload para subir. Mantener `data` como el contenido principal.
        // Si existen aislamientos, los embebemos dentro de `data` para evitar depender
        // de una columna separada `aislamientos` en la tabla de Supabase.
        let payload;
        if (aislamientosPorSolicitud && aislamientosPorSolicitud.size > 0) {
            // Convertir map a objeto simple
            const aisObj = {};
            aislamientosPorSolicitud.forEach((arr, key) => { aisObj[key] = arr; });
            // Nuevo formato: data -> { rows: <array de filas>, aislamientos: <obj> }
            payload = { data: { rows: datos, aislamientos: aisObj } };
        } else {
            payload = { data: datos };
        }

        const { error } = await supabaseClient
            .from('backup_excel')
            .insert([
                payload
            ]);
            
        if (error) throw error;
        alert('✅ Datos subidos correctamente a la nube.');
    } catch (error) {
        console.error('Error subiendo a Supabase:', error);
        alert('❌ Error al subir: ' + error.message);
    } finally {
        uploadSupabaseBtn.innerText = btnTexto;
        uploadSupabaseBtn.disabled = false;
    }
}

// Leer datos de Supabase
async function leerDatosSupabase(param) {
    const isAutoLoad = param === true;

    if (!supabaseClient) { 
        if (!isAutoLoad) alert('Supabase no configurado correctamente.');
        return; 
    }

    let btnTexto = '';
    if (readSupabaseBtn) {
        btnTexto = readSupabaseBtn.innerText;
        readSupabaseBtn.innerText = 'Cargando...';
        readSupabaseBtn.disabled = true;
    }

    try {
        // Obtener el último registro ordenado por fecha de creación (descendiente)
        const { data, error } = await supabaseClient
            .from('backup_excel')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            if (!isAutoLoad) alert('No se encontraron registros guardados en la nube.');
            return;
        }

        const record = data[0];
        // Normalizar formato de `data`: puede ser un array (rows) o un objeto con {rows, aislamientos}
        let jsonData = record.data;
        // Compatibilidad: si `data` es un objeto con `rows`, extraer rows
        if (jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData) && jsonData.rows) {
            // Cargar aislamientos embebidos dentro de data
            if (jsonData.aislamientos) {
                aislamientosPorSolicitud.clear();
                Object.keys(jsonData.aislamientos).forEach(k => {
                    aislamientosPorSolicitud.set(k, jsonData.aislamientos[k]);
                });
            }
            jsonData = jsonData.rows;
        }

        // Compatibilidad con el formato anterior: aislamientos como columna separada en el registro
        if (record.aislamientos && (!aislamientosPorSolicitud || aislamientosPorSolicitud.size === 0)) {
            aislamientosPorSolicitud.clear();
            Object.keys(record.aislamientos).forEach(k => {
                aislamientosPorSolicitud.set(k, record.aislamientos[k]);
            });
        }
        console.log("Datos recibidos de Supabase:", jsonData);

        // Mostrar fecha de los datos
        if (infoDatosNube) {
            const fechaData = new Date(record.created_at).toLocaleString();
            infoDatosNube.innerHTML = `☁️: <strong>${fechaData}</strong>`;
            infoDatosNube.style.display = 'inline-block';
        }
        
        if (!Array.isArray(jsonData) || jsonData.length < 2) {
            if (!isAutoLoad) alert('Los datos descargados no tienen el formato correcto.');
            return;
        }

        // Validar headers (fila 0)
        const headers = jsonData[0];
        if (!validarColumnas(headers)) {
            if (!isAutoLoad) alert('Las columnas de los datos guardados no coinciden con la versión actual.');
            return;
        }

        // Procesar datos (Reutilizamos la lógica de carga de archivo)
        procesarDatos(jsonData);
        // Si cargamos aislamientos desde el registro, asignarlos a los trabajos
        asignarAislamientosATrabajos();
        
        // Distribuir trabajos en calendario
        distribuirTrabajos();
        
        // Actualizar visualizaciones (Gantt eliminado)
        actualizarEstadisticasTrabajos();
        
        // Habilitar botón de exportar local
        exportBtn.disabled = false;

        if (!isAutoLoad) alert('✅ Datos cargados exitosamente desde la nube.');

    } catch (error) {
        console.error('Error leyendo de Supabase:', error);
        if (!isAutoLoad) alert('❌ Error al leer de la nube: ' + error.message);
    } finally {
        if (readSupabaseBtn && btnTexto) {
            readSupabaseBtn.innerText = btnTexto;
            readSupabaseBtn.disabled = false;
        }
    }
}

// Gantt removed: función eliminará el código Gantt. Si se necesita volver a añadir, restaurar desde control de versiones.


// Cargar automáticamente datos de la nube al iniciar
document.addEventListener('DOMContentLoaded', () => {
    if (supabaseClient) {
        console.log('Iniciando carga automática desde la nube...');
        leerDatosSupabase(true);
    }
});



