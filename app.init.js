// Event listeners
fileInput.addEventListener('change', handleFileUpload);
if (fileTxtInput) fileTxtInput.addEventListener('change', handleTxtUpload);
exportBtn.addEventListener('click', exportarExcel);
if (exportBtnTop) exportBtnTop.addEventListener('click', exportarExcel);
if (uploadSupabaseBtn) uploadSupabaseBtn.addEventListener('click', subirDatosSupabase);
if (readSupabaseBtn) readSupabaseBtn.addEventListener('click', leerDatosSupabase);

// Event listeners para filtro de texto
if (filtroTextoActivoCheckbox) {
    filtroTextoActivoCheckbox.addEventListener('change', (e) => {
        filtroTextoActivo = e.target.checked;
        filtroTextoInput.disabled = !filtroTextoActivo;
        mostrarTrabajos();
    });
}
if (filtroTextoInput) {
    filtroTextoInput.addEventListener('input', (e) => {
        filtroTextoValor = e.target.value;
        mostrarTrabajos();
    });
}

// Event listener para toggle de sección trabajos
if (toggleTrabajosBtn) {
    const mainContent = document.querySelector('.main-content');
    toggleTrabajosBtn.addEventListener('click', () => {
        const isCollapsed = trabajosSection.classList.toggle('collapsed');
        mainContent.classList.toggle('trabajos-collapsed', isCollapsed);
        toggleTrabajosBtn.textContent = isCollapsed ? '▶' : '◀';
        toggleTrabajosBtn.title = isCollapsed ? 'Mostrar trabajos' : 'Ocultar trabajos';
    });
}

if (actualizarCalendarioBtn) {
    actualizarCalendarioBtn.addEventListener('click', actualizarCalendario);
    actualizarCalendarioBtn.addEventListener('click', async () => {
        // Releer datos de la nube antes de actualizar el calendario
        // Si Supabase no está configurado, leerDatosSupabase manejará la situación.
        try {
            await leerDatosSupabase(false);
        } catch (err) {
            console.warn('Error al releer datos desde la nube:', err);
            // Continuar con la actualización local aunque falle la lectura remota
        }
        actualizarCalendario();
    });
}

// Debounce para resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(igualarAnchoDias, 200);
});

// Lógica Dropdown y Filtros
if (dropdownBtn && dropdownMenu) {
    // Toggle dropdown
    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
    });

    // Cerrar al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
            dropdownMenu.classList.remove('show');
        }
    });

    // Función auxiliar para actualizar texto
    const actualizarTextoBoton = () => {
        if (filtroTipos.has('TODOS')) {
            dropdownBtn.textContent = 'TODOS';
        } else {
            const count = filtroTipos.size;
            if (count === 0) dropdownBtn.textContent = 'Seleccionar...';
            else if (count === 1) {
                const checked = dropdownMenu.querySelector('input[type="checkbox"]:checked');
                if(checked) dropdownBtn.textContent = checked.parentElement.textContent.trim();
            } else {
                dropdownBtn.textContent = `${count} seleccionados`;
            }
        }
    };

    // Manejar cambios en checkboxes
    dropdownMenu.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const value = e.target.value;
            const checked = e.target.checked;

            if (value === 'TODOS') {
                if (checked) {
                    // Si se marca TODOS, desmarcar el resto
                    dropdownMenu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        if (cb.value !== 'TODOS') cb.checked = false;
                    });
                    filtroTipos.clear();
                    filtroTipos.add('TODOS');
                } else {
                     // Si se desmarca TODOS manualmente y no hay otros, volver a marcar o dejar vacío
                     // Comportamiento: desmarcar TODOS sin marcar otro => vacío (0 resultados)
                     filtroTipos.delete('TODOS');
                }
            } else {
                // Si se marca uno específico
                if (checked) {
                    filtroTipos.add(value);
                    // Desmarcar TODOS si estaba
                    const todosCh = dropdownMenu.querySelector('input[value="TODOS"]');
                    if (todosCh.checked) {
                         todosCh.checked = false;
                         filtroTipos.delete('TODOS');
                    }
                } else {
                    filtroTipos.delete(value);
                    // Si nos quedamos vacíos, ¿volvemos a TODOS?
                    // Dejemos que el usuario decida. Si todo desmarcado -> muestra 0.
                    if (filtroTipos.size === 0) {
                        const todosCh = dropdownMenu.querySelector('input[value="TODOS"]');
                        todosCh.checked = true;
                        filtroTipos.add('TODOS');
                    }
                }
            }
            
            actualizarTextoBoton();
            actualizarCalendario();
        });
    });
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
        
        // Si se cambia a la pestaña Listado, generar el listado
        if (tabName === 'listado') {
            generarListado();
        }
        // Si se cambia a la pestaña Aislamientos, generar el listado de aislamientos
        if (tabName === 'aislamientos') {
            renderizarAislamientos();
        }
    // Renderizar listado de aislamientos con solicitudes asociadas (formato árbol)
    function renderizarAislamientos() {
        if (!aislamientosContainer) return;
        // Si no hay datos cargados
        if (!aislamientosPorSolicitud || aislamientosPorSolicitud.size === 0) {
            aislamientosContainer.innerHTML = '<p class="empty-message">No hay aislamientos cargados</p>';
            return;
        }
        // Obtener filtros
        const filtroNumero = filtroAislamientoInput ? filtroAislamientoInput.value.trim() : '';
        const filtroTexto = filtroAislamientoTextoInput ? filtroAislamientoTextoInput.value.trim() : '';
        // Map: numero aislamiento -> { descripcion, estados, solicitudes: [id, ...] }
        const aislamientosMap = new Map();
        // Recorrer todas las solicitudes y sus aislamientos
        for (const [solicitud, aislamientosArr] of aislamientosPorSolicitud.entries()) {
            for (const a of aislamientosArr) {
                if (!aislamientosMap.has(a.numero)) {
                    aislamientosMap.set(a.numero, {
                        descripcion: a.descripcion,
                        estados: a.estados,
                        solicitudes: []
                    });
                }
                aislamientosMap.get(a.numero).solicitudes.push(solicitud);
            }
        }
        // Filtrar por número si hay filtro
        let aislamientosFiltrados = Array.from(aislamientosMap.entries());
        if (filtroNumero) {
            const tokensNumero = filtroNumero.split(/\s+/).filter(Boolean);
            if (tokensNumero.length > 0) {
                aislamientosFiltrados = aislamientosFiltrados.filter(([numero]) => {
                    return tokensNumero.some(t => numero.includes(t));
                });
            }
        }
        // Filtrar por texto (AND) si hay texto
        if (filtroTexto) {
            const tokens = filtroTexto.toLowerCase().split(/\s+/).filter(Boolean);
            if (tokens.length > 0) {
                aislamientosFiltrados = aislamientosFiltrados.filter(([_, data]) => {
                    const desc = (data.descripcion || '').toLowerCase();
                    const est = (data.estados || '').toLowerCase();
                    const haystack = (desc + ' ' + est);
                    return tokens.every(t => haystack.includes(t));
                });
            }
        }
        if (aislamientosFiltrados.length === 0) {
            aislamientosContainer.innerHTML = '<p class="empty-message">No hay aislamientos que coincidan</p>';
            return;
        }
        let html = '';
        for (const [numero, data] of aislamientosFiltrados) {
            const solicitudes = data.solicitudes || [];
            const resumen = { total: solicitudes.length, autorizado: 0, aprobado: 0, pendiente: 0 };
            const infoSolicitudes = [];

            for (const solicitud of solicitudes) {
                // Buscar trabajo asociado a la solicitud
                let textoBreve = '';
                let estado = '';
                for (const t of trabajos) {
                    if (t && t['Solicitud'] && t['Solicitud'].toString().trim() === solicitud) {
                        textoBreve = t['Texto breve'] || '';
                        // Buscar estado del permiso si existe
                        const idx = trabajos.indexOf(t);
                        estado = estadosPermisos.get(idx) || '';
                        break;
                    }
                }
                if (estado === 'AUTORIZADO') resumen.autorizado++;
                else if (estado === 'APROBADO') resumen.aprobado++;
                else if (estado === 'PENDIENTE') resumen.pendiente++;

                infoSolicitudes.push({ solicitud, textoBreve, estado });
            }

            html += `<div class="aislamiento-item">`;
            html += `<span class="aislamiento-numero">${numero}</span> <span class="aislamiento-descripcion aislamiento-descripcion-resaltada">${data.descripcion}</span> <span class="aislamiento-estados">${data.estados}</span>`;
            html += `<div class="aislamiento-resumen">`;
            html += `<span class="badge-aislamiento-resumen badge-total">Total: ${resumen.total}</span>`;
            html += `<span class="badge-aislamiento-resumen badge-autorizado">Autorizados: ${resumen.autorizado}</span>`;
            html += `<span class="badge-aislamiento-resumen badge-aprobado">Aprobados: ${resumen.aprobado}</span>`;
            html += `<span class="badge-aislamiento-resumen badge-pendiente">Pendientes: ${resumen.pendiente}</span>`;
            html += `</div>`;
            html += `<div class="aislamiento-solicitudes">`;
            html += `<ul>`;
            for (const info of infoSolicitudes) {
                const solicitud = info.solicitud;
                const textoBreve = info.textoBreve;
                const estado = info.estado;
                // Preparar badges y contenido en columnas: izquierda = texto (truncable), derecha = badges
                let deptHtml = '';
                try {
                    const trabajoObj = trabajos.find(t => t && t['Solicitud'] && t['Solicitud'].toString().trim() === solicitud);
                    let claseDept = 'tipo-otros';
                    let labelDept = '';
                    if (trabajoObj) {
                        const creadoPor = trabajoObj['Creado por'] || trabajoObj['Creado_por'] || trabajoObj.creadoPor || '';
                        if (typeof MTO_MAPPING !== 'undefined' && MTO_MAPPING) {
                            const m = MTO_MAPPING[creadoPor] || MTO_MAPPING['DEFAULT'];
                            if (m) {
                                claseDept = m.clase || claseDept;
                                labelDept = m.label || '';
                            }
                        }
                    }
                    if (labelDept) deptHtml = `<span class="departamento-badge ${claseDept}">${labelDept}</span>`;
                } catch (e) {
                    console.warn('Error obteniendo departamento para solicitud', solicitud, e);
                }

                let estadoHtml = '';
                if (estado) {
                    let badgeClass = 'badge-estado';
                    if (estado === 'AUTORIZADO') badgeClass += ' badge-autorizado';
                    else if (estado === 'APROBADO') badgeClass += ' badge-aprobado';
                    else if (estado === 'PENDIENTE') badgeClass += ' badge-pendiente';
                    else badgeClass += ' badge-otro';
                    estadoHtml = `<span class="${badgeClass}">${estado}</span>`;
                }

                     const textoHtml = textoBreve ? ` — <span class="aislamiento-solicitud-txt">${textoBreve}</span>` : '';

                     // Colocar badges justo al final del texto, inline
                     html += `<li class="aislamiento-solicitud-item">
                                     <div class="aislamiento-line"><b>${solicitud}</b>${textoHtml}${deptHtml}${estadoHtml}</div>
                                 </li>`;
            }
            html += `</ul>`;
            html += `</div>`;
            html += `</div>`;
        }
        aislamientosContainer.innerHTML = html;
    }
// Renderizar aislamientos al cargar si ya hay datos
window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('aislamientosTab')) {
        renderizarAislamientos();
    }
});

// Si cargas aislamientos desde fichero, llama a renderizarAislamientos() después de cargar los datos

    // Filtro de aislamientos por número
    if (filtroAislamientoInput) {
        filtroAislamientoInput.addEventListener('input', () => {
            renderizarAislamientos();
        });
    }
    // Filtro de aislamientos por texto
    if (filtroAislamientoTextoInput) {
        filtroAislamientoTextoInput.addEventListener('input', () => {
            renderizarAislamientos();
        });
    }
    });
});

// Event listeners para Listado
if (actualizarListadoBtn) {
    actualizarListadoBtn.addEventListener('click', generarListado);
}
if (imprimirListadoBtn) {
    imprimirListadoBtn.addEventListener('click', imprimirListado);
}
