// Manejar subida de fichero .txt con aislamientos
function handleTxtUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const parsed = parsearAislamientosTxt(text);
        if (parsed) {
            aislamientosPorSolicitud.clear();
            // parsed tiene formato { solicitudId: [ { numero, descripcion, estados } ] }
            Object.keys(parsed).forEach(k => {
                aislamientosPorSolicitud.set(k, parsed[k]);
            });

            // Asignar aislamientos a los trabajos actuales (por número de solicitud)
            asignarAislamientosATrabajos();

            alert('Aislamientos parseados y asignados correctamente');
            // Actualizar UI (listado y calendario)
            mostrarTrabajos();
            // Refrescar días mostrados
            trabajosConFechas.forEach((_, fecha) => actualizarDiaCalendario(fecha));
            // Refrescar pestaña de aislamientos si está visible o no
            if (typeof renderizarAislamientos === 'function') {
                renderizarAislamientos();
            }
        } else {
            alert('No se pudieron parsear los aislamientos');
        }
    };
    reader.readAsText(file, 'utf-8');
}

// Parsear el fichero txt con la estructura jerárquica de la muestra
function parsearAislamientosTxt(text) {
    const lines = text.split(/\r?\n/);
    const result = {}; // solicitud -> array de aislamientos

    let currentSolicitud = null;
    let lastAislamiento = null;

    const normalize = (s) => {
        if (!s) return '';
        const digits = String(s).replace(/\D/g, '');
        // eliminar ceros a la izquierda
        return digits.replace(/^0+/, '') || digits;
    };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (!raw) continue;
        const line = raw.trim();
        if (!line) continue;

        // Buscar primer número largo en la línea
        const m = line.match(/(\d{5,10})/);
        if (m) {
            const num = m[1];
            const norm = normalize(num);

            // Si el número empieza por '3' -> aislamiento ligado a la última solicitud
            if (/^3/.test(norm) && currentSolicitud) {
                // descripcion: el resto de la línea tras el número
                const descripcion = line.replace(num, '').replace(/^[-\s|]*/, '').trim();
                // buscar estados en la siguiente línea si está en mayúsculas
                let estados = '';
                if (i + 1 < lines.length) {
                    const nxt = lines[i + 1].trim();
                    if (/^[A-ZÑ0-9\s]{2,}$/.test(nxt)) { estados = nxt; i++; }
                }
                if (!result[currentSolicitud]) result[currentSolicitud] = [];
                const ais = { numero: norm, descripcion, estados };
                result[currentSolicitud].push(ais);
                lastAislamiento = ais;
            } else {
                // Nuevo identificador de Solicitud
                currentSolicitud = norm;
                lastAislamiento = null;
                if (!result[currentSolicitud]) result[currentSolicitud] = [];
            }
        } else {
            // Línea sin número: posible lista de estados que aplica al último aislamiento
            if (/^[A-ZÑ0-9\s]{2,}$/.test(line) && lastAislamiento) {
                lastAislamiento.estados = (lastAislamiento.estados ? lastAislamiento.estados + ' ' : '') + line;
            }
        }
    }

    return result;
}

// Asignar aislamientos a los trabajos en memoria buscando coincidencias por número de Solicitud
function asignarAislamientosATrabajos() {
    if (trabajos.length === 0) return;

    const normalize = (s) => {
        if (!s) return '';
        const digits = String(s).replace(/\D/g, '');
        return digits.replace(/^0+/, '') || digits;
    };

    trabajos.forEach(trabajo => {
        const solRaw = String(trabajo['Solicitud'] || '').trim();
        const sol = normalize(solRaw);

        let matches = [];
        if (aislamientosPorSolicitud.has(sol)) matches = aislamientosPorSolicitud.get(sol);
        else {
            // intentar buscar claves tocadas (con/ sin ceros)
            for (const [k, arr] of aislamientosPorSolicitud.entries()) {
                if (normalize(k) === sol) { matches = arr; break; }
            }
        }

        // Filtrar solo aislamientos que empiecen por '3' — por seguridad
        matches = (matches || []).filter(a => String(a.numero || '').startsWith('3'));

        trabajo.aislamientos = matches;
    });
}


