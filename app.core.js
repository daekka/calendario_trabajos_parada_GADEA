// Estado de la aplicación
let trabajos = []; // Array con todos los datos de trabajos
let trabajosConFechas = new Map(); // Map: fecha (string) -> array de índices de trabajos
let trabajosAsignados = new Set(); // Set de índices de trabajos que han sido asignados a alguna fecha
let trabajosModificados = new Set(); // Set de índices de trabajos cuya fecha ha sido modificada
let valoresOriginalesValidoDe = new Map(); // Map: índice -> valor original de "Válido de"
let horasTrabajos = new Map(); // Map: índice -> hora (string) para almacenar horas modificadas
let fechasFinTrabajos = new Map(); // Map: índice -> fecha fin (string) para almacenar fechas de finalización modificadas
let estadosPermisos = new Map(); // Map: índice -> estado (string) para almacenar estados de permisos: 'SOLICITADO', 'EJECUTADO', 'CERRADO'
// Map para almacenar aislamientos parseados desde fichero txt
// Estructura: { solicitudId: [ { numero: '3041727', descripcion: 'Fallo ...', estados: 'PREP NOBL NORO CERR' }, ... ] }
let aislamientosPorSolicitud = new Map();
// Map para almacenar solicitudes que empiezan por '4', agrupadas por Texto breve (normalizado)
let solicitudes4PorTexto = new Map(); // key: textoBreveNorm -> Array of solicitud strings starting with '4'
// Guardar última carga cruda (array de filas) para poder subir/recuperar exactamente el mismo formato
let ultimoJsonData = null;

// Nombres de columnas esperadas
const COLUMNAS_ESPERADAS = [
    'Orden', 'Solicitud', 'Tp.doc.descargo', 'Texto breve', 'Status de usuario',
    'Permisos', 'Documento', 'Texto explicativo', 'Interlocutor', 'Catálogo',
    'Creado por', 'Fecha de creación', 'Ubicación técnica', 'Equipo',
    'Texto explicativo', 'Válido de', 'Hora inicio validez', 'Validez a', 'Hora fin de validez',
    'Utilización'
];

// Configuración de Supabase (URL y KEY en config.js)
let supabaseClient = null;

// Inicializar cliente de Supabase
if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    if (SUPABASE_URL.startsWith('http')) {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } catch (e) {
            console.warn('Error inicializando Supabase, verifique credenciales', e);
        }
    } else {
        console.warn('Supabase URL no configurada, se omite inicialización.');
    }
}

// Helper: calcular CyMP para un trabajo (buscar solicitudes que empiezan por '4' por Texto breve)
function calcularCyMPParaTrabajo(indice) {
    const trabajo = trabajos[indice];
    if (!trabajo) return [];
    const textoBr = String(trabajo['Texto breve'] || '').replace(/^HGPIe:\s*/i, '').trim().toLowerCase();
    if (!textoBr) return [];
    const arr = solicitudes4PorTexto.get(textoBr);
    if (!arr || arr.length === 0) return [];
    // Devolver copia para evitar mutaciones
    return Array.from(arr);
}

// Referencias a elementos del DOM
const aislamientosContainer = document.getElementById('aislamientosContainer');
const filtroAislamientoInput = document.getElementById('filtroAislamientoInput');
const filtroAislamientoTextoInput = document.getElementById('filtroAislamientoTextoInput');
const fileInput = document.getElementById('fileInput');
const fileTxtInput = document.getElementById('fileTxtInput');
const exportBtn = document.getElementById('exportBtn');
const exportBtnTop = document.getElementById('exportBtnTop');
const uploadSupabaseBtn = document.getElementById('uploadSupabaseBtn');
const readSupabaseBtn = document.getElementById('readSupabaseBtn');
const infoDatosNube = document.getElementById('infoDatosNube');
const trabajosList = document.getElementById('trabajosList');
const calendarioContainer = document.getElementById('calendarioContainer');
const fechaInicio = document.getElementById('fechaInicio');
const fechaFin = document.getElementById('fechaFin');
const actualizarCalendarioBtn = document.getElementById('actualizarCalendarioBtn');
// Referencias Dropdown
const dropdownBtn = document.getElementById('dropdownBtn');
const dropdownMenu = document.getElementById('dropdownMenu');
// Referencias Listado
const listadoContainer = document.getElementById('listadoContainer');
const listadoFechaInicio = document.getElementById('listadoFechaInicio');
const listadoFechaFin = document.getElementById('listadoFechaFin');
const actualizarListadoBtn = document.getElementById('actualizarListadoBtn');
const imprimirListadoBtn = document.getElementById('imprimirListadoBtn');

// NUEVO ESTADO GLOBAL
let filtroTipos = new Set(['TODOS']);

// Estado del filtro de texto
let filtroTextoActivo = true;
let filtroTextoValor = 'HGPI';

// Referencias filtro texto
const filtroTextoActivoCheckbox = document.getElementById('filtroTextoActivo');
const filtroTextoInput = document.getElementById('filtroTextoInput');

// Referencias para toggle de sección trabajos
const trabajosSection = document.getElementById('trabajosSection');
const trabajosContent = document.getElementById('trabajosContent');
const toggleTrabajosBtn = document.getElementById('toggleTrabajosBtn');

// Inicializar la sección 'trabajos' oculta al cargar la página
(function initTrabajosCollapsed() {
    if (!trabajosSection) return;

    // Añadir clase que controla el estado collapsed
    trabajosSection.classList.add('collapsed');

    // También marcar el contenido si existe (por seguridad)
    if (trabajosContent) {
        trabajosContent.classList.add('collapsed');
    }

    // Añadir clase al main para mantener el layout consistente
    const mainContentInit = document.querySelector('.main-content');
    if (mainContentInit) mainContentInit.classList.add('trabajos-collapsed');

    // Actualizar el texto y tooltip del botón toggle si existe
    if (toggleTrabajosBtn) {
        toggleTrabajosBtn.textContent = '▶';
        toggleTrabajosBtn.title = 'Mostrar trabajos';
        toggleTrabajosBtn.setAttribute('aria-expanded', 'false');
    }
})();

