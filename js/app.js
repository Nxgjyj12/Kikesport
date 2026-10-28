// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyC3j2gbwzjjNPH_s7G8iAzXcHImkR3jfLE",
    authDomain: "kikesport-3a34f.firebaseapp.com",
    projectId: "kikesport-3a34f",
    storageBucket: "kikesport-3a34f.firebasestorage.app",
    messagingSenderId: "668077708122",
    appId: "1:668077708122:web:054ea1c16ef3fd9ec95963",
    measurementId: "G-6EBVY9S750"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Configuración global Chart.js para contraste
Chart.defaults.color = '#cbd5e1';
Chart.defaults.font.family = 'Poppins';

function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-xmark' : 'fa-circle-check'}"></i> ${sanitizeHTML(message)}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function mostrarTabAuth(tab) {
    document.getElementById('formLogin').classList.toggle('hidden', tab !== 'login');
    document.getElementById('formRegister').classList.toggle('hidden', tab !== 'register');
    document.getElementById('tabLoginBtn').classList.toggle('active', tab === 'login');
    document.getElementById('tabRegisterBtn').classList.toggle('active', tab === 'register');
}

let currentUser = null;
let localPlantillas = [];
let selectedPlanTipo = 'mensual';

// --- AUTENTICACIÓN ---

function registrarNuevoUsuario() {
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value.trim();
    const confirmPass = document.getElementById('regConfirmPassword').value.trim();
    const terms = document.getElementById('regTerms').checked;

    if (!username || !email || !pass) return showToast("Completa todos los campos", "error");
    if (!terms) return showToast("Debes aceptar los términos y privacidad", "error");
    if (pass !== confirmPass) return showToast("Las contraseñas no coinciden", "error");
    if (pass.length < 6) return showToast("Contraseña muy corta (min. 6)", "error");

    auth.createUserWithEmailAndPassword(email, pass)
        .then(async (userCredential) => {
            const uid = userCredential.user.uid;
            // Se crea el usuario en Firestore con plan básico directamente
            await db.collection('users').doc(uid).set({
                email: email.toLowerCase(),
                username: username,
                plan: 'basica',
                planTipo: 'gratuito'
            });
            showToast("¡Registro exitoso! Iniciando sesión...");
            // No hacemos signOut, entramos de una vez
            cargarDatosUsuario(userCredential.user);
        })
        .catch(error => showToast("Error al registrar: " + error.message, "error"));
}

function iniciarSesion() {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPassword').value.trim();
    if (!email || !pass) return showToast("Ingresa tu correo y contraseña", "error");

    auth.signInWithEmailAndPassword(email, pass)
        .then(userCredential => {
            // Ya no verificamos emailVerified, pasamos directo
            cargarDatosUsuario(userCredential.user);
        })
        .catch(() => showToast("Correo o contraseña incorrectos", "error"));
}

function recuperarPassword() {
    const email = document.getElementById('authEmail').value.trim();
    if(!email) return showToast("Ingresa tu correo para recuperar la contraseña", "error");
    auth.sendPasswordResetEmail(email)
        .then(() => showToast("Correo de recuperación enviado."))
        .catch(error => showToast(error.message, "error"));
}

auth.onAuthStateChanged(async (user) => {
    // Escucha si hay sesión activa al recargar la página (sin verificar emailVerified)
    if (user) {
        await cargarDatosUsuario(user);
    }
});

async function cargarDatosUsuario(user) {
    try {
        const docRef = await db.collection('users').doc(user.uid).get();
        if (docRef.exists) {
            currentUser = { uid: user.uid, ...docRef.data() };
        } else {
            // Backup por si se eliminó el documento manual
            currentUser = { uid: user.uid, email: user.email, username: user.email.split('@')[0], plan: 'basica', planTipo: 'gratuito' };
            await db.collection('users').doc(user.uid).set(currentUser);
        }
        await cargarPlantillasFirestore();
        
        document.getElementById('landingScreen').classList.add('hidden');
        document.getElementById('authScreen').classList.add('hidden');
        
        showDashboard();
        showToast(`¡Bienvenido ${sanitizeHTML(currentUser.username)}!`);
    } catch (e) {
        showToast("Error conectando con la base de datos.", "error");
    }
}

async function cargarPlantillasFirestore() {
    const snapshot = await db.collection('users').doc(currentUser.uid).collection('plantillas').get();
    localPlantillas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function logout() { 
    auth.signOut().then(() => { currentUser = null; localPlantillas = []; location.reload(); });
}

// --- DEPORTES Y COORDENADAS ---
const SPORT_POSITIONS = {
    Futbol: ["Portero", "Defensa Central", "Lateral", "Mediocentro", "Extremo", "Delantero Centro"],
    Basquetbol: ["Base (PG)", "Escolta (SG)", "Alero (SF)", "Ala-Pívot (PF)", "Pívot (C)"],
    Voleybol: ["Colocador/Armador", "Rematador/Punta", "Central", "Opuesto", "Líbero"],
    Beisbol: ["Lanzador (P)", "Receptor (C)", "1ª Base", "2ª Base", "3ª Base", "Torpedeiro (SS)", "Jardinero Izquierdo (LF)", "Jardinero Central (CF)", "Jardinero Derecho (RF)"]
};

const DEFAULT_POSITION_COORDS = {
    Futbol: { "Portero": { x: 8, y: 50 }, "Defensa Central": { x: 26, y: 50 }, "Lateral": { x: 26, y: 20 }, "Mediocentro": { x: 50, y: 50 }, "Extremo": { x: 74, y: 20 }, "Delantero Centro": { x: 86, y: 50 } },
    Basquetbol: { "Base (PG)": { x: 30, y: 50 }, "Escolta (SG)": { x: 42, y: 25 }, "Alero (SF)": { x: 42, y: 75 }, "Ala-Pívot (PF)": { x: 70, y: 35 }, "Pívot (C)": { x: 75, y: 65 } },
    Voleybol: { "Colocador/Armador": { x: 42, y: 35 }, "Rematador/Punta": { x: 30, y: 75 }, "Central": { x: 42, y: 55 }, "Opuesto": { x: 20, y: 25 }, "Líbero": { x: 15, y: 55 } },
    Beisbol: { "Receptor (C)": { x: 50, y: 88 }, "Lanzador (P)": { x: 50, y: 60 }, "1ª Base": { x: 70, y: 60 }, "2ª Base": { x: 58, y: 38 }, "3ª Base": { x: 30, y: 60 }, "Torpedeiro (SS)": { x: 42, y: 38 }, "Jardinero Izquierdo (LF)": { x: 22, y: 22 }, "Jardinero Central (CF)": { x: 50, y: 15 }, "Jardinero Derecho (RF)": { x: 78, y: 22 } }
};

const SPORT_COURT_SVGS = {
    Futbol: `<svg class="court-svg-bg" viewBox="0 0 600 350" preserveAspectRatio="xMidYMid slice"><rect width="600" height="350" fill="#15803d"/><rect x="20" y="20" width="560" height="310" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/><line x1="300" y1="20" x2="300" y2="330" stroke="#ffffff" stroke-width="3" opacity="0.85"/><circle cx="300" cy="175" r="50" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/><circle cx="300" cy="175" r="4" fill="#ffffff"/><rect x="20" y="85" width="90" height="180" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/><rect x="20" y="125" width="35" height="100" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/><rect x="490" y="85" width="90" height="180" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/><rect x="545" y="125" width="35" height="100" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/></svg>`,
    Basquetbol: `<svg class="court-svg-bg" viewBox="0 0 600 350" preserveAspectRatio="xMidYMid slice"><rect width="600" height="350" fill="#9a3412"/><rect x="20" y="20" width="560" height="310" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/><line x1="300" y1="20" x2="300" y2="330" stroke="#ffffff" stroke-width="3" opacity="0.85"/><circle cx="300" cy="175" r="40" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/><rect x="20" y="115" width="110" height="120" fill="rgba(255,255,255,0.15)" stroke="#ffffff" stroke-width="3" opacity="0.85"/><path d="M 20,40 A 150,150 0 0,1 20,310" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/><rect x="470" y="115" width="110" height="120" fill="rgba(255,255,255,0.15)" stroke="#ffffff" stroke-width="3" opacity="0.85"/><path d="M 580,40 A 150,150 0 0,0 580,310" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/></svg>`,
    Voleybol: `<svg class="court-svg-bg" viewBox="0 0 600 350" preserveAspectRatio="xMidYMid slice"><rect width="600" height="350" fill="#0f172a"/><rect x="20" y="20" width="560" height="310" fill="#1e40af" stroke="#ffffff" stroke-width="3" opacity="0.9"/><line x1="300" y1="15" x2="300" y2="335" stroke="#fbbf24" stroke-width="5" opacity="0.9"/><line x1="207" y1="20" x2="207" y2="330" stroke="#ffffff" stroke-width="3" stroke-dasharray="6,4" opacity="0.85"/><line x1="393" y1="20" x2="393" y2="330" stroke="#ffffff" stroke-width="3" stroke-dasharray="6,4" opacity="0.85"/></svg>`,
    Beisbol: `<svg class="court-svg-bg" viewBox="0 0 600 350" preserveAspectRatio="xMidYMid slice"><rect width="600" height="350" fill="#166534"/><path d="M 50,20 L 300,310 L 550,20 Z" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.5"/><path d="M 50,80 Q 300,-30 550,80" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.85"/><polygon points="300,310 420,210 300,110 180,210" fill="#7c2d12" stroke="#ffffff" stroke-width="2" opacity="0.85"/><circle cx="300" cy="210" r="18" fill="#a16207" stroke="#ffffff" stroke-width="2"/><rect x="294" y="208" width="12" height="4" fill="#ffffff"/><polygon points="300,315 293,308 293,302 307,302 307,308" fill="#ffffff"/><rect x="414" y="204" width="12" height="12" fill="#ffffff" transform="rotate(45 420 210)"/><rect x="294" y="104" width="12" height="12" fill="#ffffff" transform="rotate(45 300 110)"/><rect x="174" y="204" width="12" height="12" fill="#ffffff" transform="rotate(45 180 210)"/></svg>`
};

// --- PLANES PRO ---
function abrirModalSuscripcion() { document.getElementById('modalSuscripcion').classList.remove('hidden'); }
function cerrarModalSuscripcion() { document.getElementById('modalSuscripcion').classList.add('hidden'); }
function seleccionarPlanSuscripcion(tipo) { selectedPlanTipo = tipo; }

async function simularPagoExitoso() {
    try {
        await db.collection('users').doc(currentUser.uid).update({ plan: 'pro', planTipo: selectedPlanTipo });
        currentUser.plan = 'pro';
        currentUser.planTipo = selectedPlanTipo;
        cerrarModalSuscripcion();
        showDashboard();
        showToast("¡Pago simulado! Suscripción PRO Activada.");
    } catch (e) {
        showToast("Error al actualizar suscripción", "error");
    }
}

let canvasInitialized = false;

function showDashboard() {
    document.getElementById('userHeaderInfo').classList.remove('hidden');
    document.getElementById('userNameDisplay').innerText = sanitizeHTML(currentUser.username);
    
    const badge = document.getElementById('userPlanBadge');
    badge.innerText = currentUser.plan === 'pro' ? `PRO (${currentUser.planTipo || 'mensual'})` : 'BÁSICA';
    badge.className = `badge-plan badge-${currentUser.plan}`;
    
    renderPlantillasList();
    applyProRestrictions();
    if (!canvasInitialized) { initCanvas(); canvasInitialized = true; }
}

// --- PLANTILLAS Y JUGADORES ---
let activePlantillaId = null;
let activePlantillaData = null;
let editingPlayerIndex = null;
let sheetMatrix = [];
let selectedR = 0, selectedC = 0;
let teamChartObj = null, radarChartObj = null;
let isDrawingMode = false, isDrawing = false, ctx = null;

async function crearPlantilla() {
    if (currentUser.plan === 'basica' && localPlantillas.length >= 1) return showToast("Plan Básico: Máximo 1 plantilla.", "error");
    
    const name = document.getElementById('newPlantillaName').value.trim();
    if (!name) return showToast("Ingresa un nombre para el equipo", "error");
    
    const newId = Date.now().toString();
    const newP = { name: name, deporte: document.getElementById('newPlantillaSport').value, jugadores: [] };
    
    try {
        await db.collection('users').doc(currentUser.uid).collection('plantillas').doc(newId).set(newP);
        localPlantillas.push({ id: newId, ...newP });
        document.getElementById('newPlantillaName').value = '';
        showToast("Plantilla creada exitosamente");
        selectPlantilla(newId);
    } catch (e) {
        showToast("Error al guardar plantilla", "error");
    }
}

function autocompletarEquipo() {
    const plantilla = localPlantillas.find(p => p.id === activePlantillaId);
    if (!plantilla) return showToast("Selecciona una plantilla primero", "error");

    const posiciones = SPORT_POSITIONS[plantilla.deporte] || [];
    const nombresAuto = ["Carlos López", "Mateo Gómez", "Luis Hernández", "Gabriel Torres", "Andrés Ríos", "Javier Silva"];

    nombresAuto.forEach((nom, i) => {
        // Se respeta el límite de 15 del plan básico
        if (currentUser.plan === 'basica' && plantilla.jugadores.length >= 15) return;
        const pos = posiciones[i % posiciones.length];
        const est = 1.75 + (i * 0.02);
        const peso = 70 + (i * 2);
        const defPos = (DEFAULT_POSITION_COORDS[plantilla.deporte] || {})[pos] || {x:50, y:50};

        plantilla.jugadores.push({
            name: nom, estatura: est.toFixed(2), peso: peso, posicion: pos,
            vel: 75 + (i*2), fue: 70 + i, res: 80 - i, tec: 78,
            imc: (peso / (est * est)).toFixed(1), promedio: 76,
            x: defPos.x, y: defPos.y
        });
    });

    guardarPlantillaActualizada().then(() => {
        renderJugadores();
        showToast("Plantilla autocompletada con datos inteligentes.");
    });
}

function selectPlantilla(id) { activePlantillaId = id; cancelarEdicion(); renderPlantillasList(); renderJugadores(); }

function renderPlantillasList() {
    document.getElementById('plantillasCounter').innerText = `${localPlantillas.length}/${currentUser.plan==='basica'?1:'∞'}`;
    const container = document.getElementById('plantillasList'); container.innerHTML = '';
    
    if (localPlantillas.length === 0) { container.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">No hay plantillas.</div>'; return; }
    if (!activePlantillaId || !localPlantillas.find(p=>p.id === activePlantillaId)) activePlantillaId = localPlantillas[0].id;

    localPlantillas.forEach(p => {
        container.innerHTML += `
            <div class="plantilla-card ${p.id === activePlantillaId ? 'active' : ''}" onclick="selectPlantilla('${p.id}')">
                <div><div style="font-weight:700;">${sanitizeHTML(p.name)}</div><div style="font-size:12px; color:var(--text-muted);">${sanitizeHTML(p.deporte)} • ${p.jugadores.length} Atletas</div></div>
                <button class="action-btn-small" style="color:var(--danger-red); border-color:var(--danger-red);" onclick="eliminarPlantilla('${p.id}', event)">🗑️</button>
            </div>`;
    });
}

async function eliminarPlantilla(id, event) {
    event.stopPropagation();
    if (confirm("¿Deseas eliminar completamente esta plantilla?")) {
        try {
            await db.collection('users').doc(currentUser.uid).collection('plantillas').doc(id).delete();
            localPlantillas = localPlantillas.filter(p => p.id !== id);
            activePlantillaId = localPlantillas.length > 0 ? localPlantillas[0].id : null;
            renderPlantillasList(); renderJugadores();
            showToast("Plantilla eliminada");
        } catch(e) {
            showToast("Error al eliminar", "error");
        }
    }
}

async function guardarPlantillaActualizada() {
    const plantilla = localPlantillas.find(p => p.id === activePlantillaId);
    if(plantilla) {
        const { id, ...dataToSave } = plantilla;
        await db.collection('users').doc(currentUser.uid).collection('plantillas').doc(id).set(dataToSave);
    }
}

async function guardarJugador() {
    const plantilla = localPlantillas.find(p => p.id === activePlantillaId);
    if (!plantilla) return;

    const name = document.getElementById('playerName').value.trim();
    const est = parseFloat(document.getElementById('playerHeight').value) || 0;
    const peso = parseFloat(document.getElementById('playerWeight').value) || 0;
    const vel = parseInt(document.getElementById('statVel').value) || 0;
    const fue = parseInt(document.getElementById('statFue').value) || 0;
    const res = parseInt(document.getElementById('statRes').value) || 0;
    const tec = parseInt(document.getElementById('statTec').value) || 0;

    if (!name || !est || !peso) return showToast("Ingresa datos físicos válidos", "error");
    if (est < 1.0 || est > 2.5) return showToast("Estatura fuera de rango (1.0 - 2.5m)", "error");
    if (peso < 30 || peso > 200) return showToast("Peso fuera de rango (30 - 200kg)", "error");
    if ([vel, fue, res, tec].some(v => v < 0 || v > 100)) return showToast("Atributos deben estar entre 0 y 100", "error");

    const jData = {
        name: name, estatura: est, peso, posicion: document.getElementById('playerPosition').value,
        vel, fue, res, tec, imc: (peso / (est * est)).toFixed(1), promedio: Math.round((vel+fue+res+tec)/4)
    };

    if (editingPlayerIndex !== null) {
        jData.x = plantilla.jugadores[editingPlayerIndex].x;
        jData.y = plantilla.jugadores[editingPlayerIndex].y;
        plantilla.jugadores[editingPlayerIndex] = jData;
        showToast("Atleta actualizado");
    } else {
        if (currentUser.plan === 'basica' && plantilla.jugadores.length >= 15) return showToast("Límite Básico (15 atletas) alcanzado.", "error");
        const defPos = (DEFAULT_POSITION_COORDS[plantilla.deporte] || {})[jData.posicion] || {x:50, y:50};
        jData.x = defPos.x; jData.y = defPos.y;
        plantilla.jugadores.push(jData);
        showToast("Atleta registrado");
    }
    
    await guardarPlantillaActualizada();
    cancelarEdicion(); renderJugadores();
}

function renderJugadores() {
    const plantilla = localPlantillas.find(p => p.id === activePlantillaId);
    const formBox = document.getElementById('playerFormBox');
    const playersList = document.getElementById('playersList');

    if (!plantilla) { formBox.classList.add('hidden'); playersList.innerHTML = ''; activePlantillaData = null; return; }
    activePlantillaData = plantilla;
    document.getElementById('currentPlantillaTitle').innerText = `${sanitizeHTML(plantilla.name)} (${sanitizeHTML(plantilla.deporte)})`;
    document.getElementById('playersCounter').innerText = `${plantilla.jugadores.length} Atletas`;
    
    formBox.classList.remove('hidden');
    const posSelect = document.getElementById('playerPosition'); posSelect.innerHTML = '';
    (SPORT_POSITIONS[plantilla.deporte] || []).forEach(pos => posSelect.innerHTML += `<option value="${sanitizeHTML(pos)}">${sanitizeHTML(pos)}</option>`);

    playersList.innerHTML = '';
    plantilla.jugadores.forEach((j, idx) => {
        playersList.innerHTML += `
            <div style="background:rgba(0,0,0,0.4); padding:10px 15px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="color:#fff;">#${idx+1} ${sanitizeHTML(j.name)}</strong> <span style="font-size:11px; color:var(--neon-green)">(${sanitizeHTML(j.posicion)})</span>
                    <div style="font-size:11px; color:var(--text-muted);">${j.estatura}m | ${j.peso}kg | IMC: ${j.imc} | VEL:${j.vel} FUE:${j.fue} RES:${j.res} TEC:${j.tec}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:800; font-size:16px; color:var(--neon-green); margin-right:5px;">${j.promedio}</span>
                    <button class="action-btn-small" onclick="prepararEdicionJugador(${idx})">✏</button>
                    <button class="action-btn-small" style="color:var(--danger-red); border-color:var(--danger-red)" onclick="eliminarJugador(${idx})">🗑️</button>
                </div>
            </div>`;
    });

    convertirAMatrizSheet(); renderCancha(plantilla); renderGraficas(plantilla);
}

function prepararEdicionJugador(idx) {
    const j = activePlantillaData.jugadores[idx];
    editingPlayerIndex = idx;
    document.getElementById('playerName').value = j.name; document.getElementById('playerHeight').value = j.estatura;
    document.getElementById('playerWeight').value = j.peso; document.getElementById('playerPosition').value = j.posicion;
    document.getElementById('statVel').value = j.vel; document.getElementById('statFue').value = j.fue;
    document.getElementById('statRes').value = j.res; document.getElementById('statTec').value = j.tec;
    document.getElementById('btnSavePlayer').innerText = "Guardar Cambios"; document.getElementById('btnCancelEdit').classList.remove('hidden');
}

function cancelarEdicion() {
    editingPlayerIndex = null; document.getElementById('btnSavePlayer').innerText = "Guardar Jugador"; document.getElementById('btnCancelEdit').classList.add('hidden');
    ['playerName','playerHeight','playerWeight','statVel','statFue','statRes','statTec'].forEach(id => document.getElementById(id).value = '');
}

async function eliminarJugador(idx) {
    if (confirm("¿Deseas eliminar a este atleta?")) {
        localPlantillas.find(p => p.id === activePlantillaId).jugadores.splice(idx, 1);
        await guardarPlantillaActualizada();
        renderJugadores(); showToast("Atleta eliminado");
    }
}

// --- HOJA DE CÁLCULO ---
function colALetra(index) {
    let letra = ''; while (index >= 0) { letra = String.fromCharCode((index % 26) + 65) + letra; index = Math.floor(index / 26) - 1; }
    return letra;
}

function convertirAMatrizSheet() {
    sheetMatrix = [["Nombre", "Estatura_m", "Peso_kg", "Posicion", "Velocidad", "Fuerza", "Resistencia", "Tecnica", "IMC"]];
    if (activePlantillaData) activePlantillaData.jugadores.forEach(j => sheetMatrix.push([j.name, j.estatura, j.peso, j.posicion, j.vel, j.fue, j.res, j.tec, j.imc]));
    while (sheetMatrix.length < 12) sheetMatrix.push(new Array(9).fill(''));
    renderHojaCalculo();
}

function evaluarFormulaSheet(val) {
    if (typeof val !== 'string' || !val.startsWith('=')) return val;
    try {
        let formula = val.substring(1).toUpperCase().trim();
        const match = formula.match(/^(SUM|AVERAGE|MIN|MAX|COUNT|MEDIAN)\(([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)$/);
        if (match) {
            const fn = match[1], pIni = parseRef(match[2]), pFin = parseRef(match[3]);
            let vals = [];
            for (let r = Math.min(pIni.r, pFin.r); r <= Math.max(pIni.r, pFin.r); r++) {
                for (let c = Math.min(pIni.c, pFin.c); c <= Math.max(pIni.c, pFin.c); c++) {
                    let num = parseFloat(sheetMatrix[r]?.[c]);
                    if (!isNaN(num)) vals.push(num);
                }
            }
            if (!vals.length) return 0;
            if (fn === 'SUM') return vals.reduce((a, b) => a + b, 0);
            if (fn === 'AVERAGE') return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
            if (fn === 'MIN') return Math.min(...vals);
            if (fn === 'MAX') return Math.max(...vals);
            if (fn === 'COUNT') return vals.length;
            if (fn === 'MEDIAN') {
                vals.sort((a,b) => a-b);
                const mid = Math.floor(vals.length / 2);
                return vals.length % 2 !== 0 ? vals[mid] : ((vals[mid - 1] + vals[mid]) / 2).toFixed(2);
            }
        }
        return val;
    } catch { return '#ERROR!'; }
}

function parseRef(ref) {
    const colStr = ref.replace(/[0-9]/g, ''); const rowStr = ref.replace(/[A-Z]/g, '');
    let col = 0; for (let i = 0; i < colStr.length; i++) col = col * 26 + (colStr.charCodeAt(i) - 64);
    return { r: parseInt(rowStr) - 1, c: col - 1 };
}

function renderHojaCalculo() {
    const thead = document.getElementById('sheetHead'); const tbody = document.getElementById('sheetBody');
    const cols = Math.max(9, ...sheetMatrix.map(r => r.length));
    
    let headHtml = '<tr><th style="width:40px;"></th>';
    for (let c = 0; c < cols; c++) headHtml += `<th style="width:120px;">${colALetra(c)}</th>`;
    thead.innerHTML = headHtml + '</tr>';

    let bodyHtml = '';
    for (let r = 0; r < sheetMatrix.length; r++) {
        bodyHtml += `<tr><th>${r + 1}</th>`;
        for (let c = 0; c < cols; c++) {
            let raw = sheetMatrix[r]?.[c] || '';
            bodyHtml += `<td id="scell-${r}-${c}" onclick="seleccionarCeldaSheet(${r},${c})" ondblclick="editarCeldaSheet(${r},${c})">${sanitizeHTML(evaluarFormulaSheet(raw).toString())}</td>`;
        }
        bodyHtml += '</tr>';
    }
    tbody.innerHTML = bodyHtml;
}

function seleccionarCeldaSheet(r, c) {
    const prev = document.querySelector('td.selected-cell'); if (prev) prev.classList.remove('selected-cell');
    selectedR = r; selectedC = c;
    const celda = document.getElementById(`scell-${r}-${c}`); if (celda) celda.classList.add('selected-cell');
    document.getElementById('sheetCellRef').innerText = `${colALetra(c)}${r + 1}`;
    document.getElementById('sheetFormulaInput').value = sheetMatrix[r]?.[c] || '';
}

function editarCeldaSheet(r, c) {
    const td = document.getElementById(`scell-${r}-${c}`); td.contentEditable = "true";
    td.innerText = sheetMatrix[r]?.[c] || ''; td.focus();
    const guardar = () => {
        td.contentEditable = "false";
        if (!sheetMatrix[r]) sheetMatrix[r] = []; sheetMatrix[r][c] = td.innerText.trim();
        renderHojaCalculo(); seleccionarCeldaSheet(r, c);
        sincronizarHojaAJugadores();
    };
    td.onblur = guardar; td.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } };
}

document.getElementById('sheetFormulaInput').addEventListener('keyup', function(e) {
    if(e.key === 'Enter') {
        if (!sheetMatrix[selectedR]) sheetMatrix[selectedR] = [];
        sheetMatrix[selectedR][selectedC] = this.value;
        renderHojaCalculo();
        sincronizarHojaAJugadores();
    }
});

function agregarFilaSheet() {
    const cols = sheetMatrix[0] ? sheetMatrix[0].length : 9;
    sheetMatrix.push(new Array(cols).fill(''));
    renderHojaCalculo();
}

function eliminarFilaSheet() {
    if (sheetMatrix.length <= 1) return;
    sheetMatrix.splice(selectedR, 1);
    renderHojaCalculo();
    sincronizarHojaAJugadores();
}

async function sincronizarHojaAJugadores() {
    const plantilla = localPlantillas.find(p => p.id === activePlantillaId);
    if (!plantilla) return;

    const posiciones = SPORT_POSITIONS[plantilla.deporte] || [];
    let nuevosJugadores = [];

    for (let r = 1; r < sheetMatrix.length; r++) {
        const fila = sheetMatrix[r];
        if (!fila || !fila[0] || fila[0].toString().trim() === '') continue;
        if (fila[0].toString().startsWith('=')) continue; // Evitar contar las filas de fórmulas

        if (currentUser.plan === 'basica' && nuevosJugadores.length >= 15) break;

        const name = fila[0].toString().trim();
        const estatura = parseFloat(fila[1]) || 1.70;
        const peso = parseFloat(fila[2]) || 70;
        let posicion = fila[3] ? fila[3].toString().trim() : posiciones[0];
        if (!posiciones.includes(posicion)) posicion = posiciones[0];

        const vel = fila[4] !== '' && fila[4] !== undefined ? parseInt(fila[4]) : 70;
        const fue = fila[5] !== '' && fila[5] !== undefined ? parseInt(fila[5]) : 70;
        const res = fila[6] !== '' && fila[6] !== undefined ? parseInt(fila[6]) : 70;
        const tec = fila[7] !== '' && fila[7] !== undefined ? parseInt(fila[7]) : 70;

        const imc = (peso / (estatura * estatura)).toFixed(1);
        const promedio = Math.round((vel + fue + res + tec) / 4);
        
        let oldPlayer = plantilla.jugadores.find(j => j.name === name);
        const defPos = (DEFAULT_POSITION_COORDS[plantilla.deporte] || {})[posicion] || { x: 50, y: 50 };

        nuevosJugadores.push({ 
            name, estatura, peso, imc, posicion, vel, fue, res, tec, promedio, 
            x: oldPlayer ? oldPlayer.x : defPos.x, 
            y: oldPlayer ? oldPlayer.y : defPos.y 
        });
    }

    plantilla.jugadores = nuevosJugadores;
    await guardarPlantillaActualizada();
    activePlantillaData = plantilla;
    showToast("Sincronización de hoja completada.");
    renderCancha(plantilla);
}

// --- PIZARRÓN TÁCTICO ---
function initCanvas() {
    const canvas = document.getElementById('drawingCanvas'); ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.parentElement.clientWidth; canvas.height = canvas.parentElement.clientHeight; };
    window.addEventListener('resize', resize); setTimeout(resize, 100);
    
    // Soporte nativo para pantallas táctiles (Touch/Pen) y Mouse
    canvas.addEventListener('pointerdown', startDrawing); 
    canvas.addEventListener('pointermove', draw);
    canvas.addEventListener('pointerup', stopDrawing); 
    canvas.addEventListener('pointerout', stopDrawing);
}

function toggleDrawingMode() {
    isDrawingMode = !isDrawingMode;
    const canvas = document.getElementById('drawingCanvas');
    const btn = document.getElementById('btnToggleDraw');
    canvas.style.pointerEvents = isDrawingMode ? 'auto' : 'none';
    btn.style.borderColor = isDrawingMode ? 'var(--neon-green)' : 'var(--glass-border)';
    btn.style.color = isDrawingMode ? 'var(--neon-green)' : 'var(--text-light)';
}

function startDrawing(e) { if (!isDrawingMode) return; isDrawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); }
function draw(e) { if (!isDrawing || !isDrawingMode) return; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#fbbf24'; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); }
function stopDrawing() { isDrawing = false; }

async function exportarCanchaPNG() {
    if (currentUser.plan !== 'pro') return showToast("Exportación de Pizarrón es solo PRO", "error");
    const court = document.getElementById('courtArea');
    try {
        const canvas = await html2canvas(court, { backgroundColor: '#000' });
        const link = document.createElement('a'); link.download = `Tacticas_${activePlantillaData.name}.png`;
        link.href = canvas.toDataURL('image/png'); link.click();
        showToast("Pizarrón exportado a PNG.");
    } catch (err) { showToast("Error al exportar PNG", "error"); }
}

function renderCancha(plantilla) {
    const svgHTML = SPORT_COURT_SVGS[plantilla.deporte] || SPORT_COURT_SVGS['Futbol'];
    const courtArea = document.getElementById('courtArea');
    
    let bgLayer = document.getElementById('courtBgLayer');
    if(!bgLayer) { bgLayer = document.createElement('div'); bgLayer.id = 'courtBgLayer'; courtArea.prepend(bgLayer); }
    bgLayer.innerHTML = svgHTML;

    const playersLayer = document.getElementById('playersLayer'); playersLayer.innerHTML = '';
    document.getElementById('canchaHeaderTitle').innerText = `Pizarrón Táctico - ${sanitizeHTML(plantilla.deporte)}`;
    const defMap = DEFAULT_POSITION_COORDS[plantilla.deporte] || {};

    plantilla.jugadores.forEach((j, i) => {
        const node = document.createElement('div'); node.className = 'player-node';
        const posX = j.x !== undefined ? j.x : (defMap[j.posicion]?.x || 20 + ((i * 15) % 60));
        const posY = j.y !== undefined ? j.y : (defMap[j.posicion]?.y || 20 + ((i * 20) % 60));
        node.style.left = `${posX}%`; node.style.top = `${posY}%`;
        node.innerHTML = `<div class="player-badge">${i + 1}</div><div class="player-label">${sanitizeHTML(j.name)}</div>`;
        habilitarArrastreNodo(node, i); playersLayer.appendChild(node);
    });
}

function habilitarArrastreNodo(node, index) {
    let dragging = false;
    node.addEventListener('pointerdown', (e) => { dragging = true; node.setPointerCapture(e.pointerId); });
    node.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = document.getElementById('courtArea').getBoundingClientRect();
        let x = Math.max(4, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100));
        let y = Math.max(4, Math.min(96, ((e.clientY - rect.top) / rect.height) * 100));
        node.style.left = `${x}%`; node.style.top = `${y}%`;
    });
    node.addEventListener('pointerup', async (e) => {
        if (!dragging) return; dragging = false; node.releasePointerCapture(e.pointerId);
        const rect = document.getElementById('courtArea').getBoundingClientRect();
        const p = localPlantillas.find(item => item.id === activePlantillaId);
        if (p && p.jugadores[index]) {
            p.jugadores[index].x = Math.max(4, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100));
            p.jugadores[index].y = Math.max(4, Math.min(96, ((e.clientY - rect.top) / rect.height) * 100));
            await guardarPlantillaActualizada();
            activePlantillaData = p;
        }
    });
}

async function resetFormacionOriginal() {
    if(ctx) ctx.clearRect(0, 0, document.getElementById('drawingCanvas').width, document.getElementById('drawingCanvas').height);
    const p = localPlantillas.find(i => i.id === activePlantillaId);
    if (!p) return;
    const defMap = DEFAULT_POSITION_COORDS[p.deporte] || {};
    p.jugadores.forEach(j => { j.x = defMap[j.posicion]?.x || 50; j.y = defMap[j.posicion]?.y || 50; });
    await guardarPlantillaActualizada();
    renderCancha(p); showToast("Formación reiniciada");
}

// --- GRÁFICAS Y PDF ---
function renderGraficas(plantilla) {
    if (!plantilla || !plantilla.jugadores.length) {
        if (teamChartObj) teamChartObj.destroy(); if (radarChartObj) radarChartObj.destroy(); return;
    }
    
    const avgV = plantilla.jugadores.reduce((a,b)=>a+b.vel,0)/plantilla.jugadores.length;
    const avgF = plantilla.jugadores.reduce((a,b)=>a+b.fue,0)/plantilla.jugadores.length;
    const avgR = plantilla.jugadores.reduce((a,b)=>a+b.res,0)/plantilla.jugadores.length;
    const avgT = plantilla.jugadores.reduce((a,b)=>a+b.tec,0)/plantilla.jugadores.length;

    if (teamChartObj) teamChartObj.destroy();
    teamChartObj = new Chart(document.getElementById('chartTeamStats'), {
        type: 'bar', data: {
            labels: ['Velocidad', 'Fuerza', 'Resistencia', 'Técnica'],
            datasets: [{ label: 'Promedio Equipo', data: [avgV, avgF, avgR, avgT], backgroundColor: ['rgba(0,255,102,0.7)', 'rgba(59,130,246,0.7)', 'rgba(245,158,11,0.7)', 'rgba(236,72,153,0.7)'] }]
        }, options: { scales: { y: { max: 100 } } }
    });

    const sel1 = document.getElementById('radarPlayer1Select'); const sel2 = document.getElementById('radarPlayer2Select');
    sel1.innerHTML = '<option value="promedio">Promedio General</option>';
    sel2.innerHTML = '<option value="ninguno">-- Ninguno --</option>';
    
    plantilla.jugadores.forEach((j, idx) => {
        const opt = `<option value="${idx}">${sanitizeHTML(j.name)}</option>`;
        sel1.innerHTML += opt; sel2.innerHTML += opt;
    });
    actualizarGraficaRadar();
}

function actualizarGraficaRadar() {
    if (!activePlantillaData || !activePlantillaData.jugadores.length) return;
    const v1 = document.getElementById('radarPlayer1Select').value;
    const v2 = document.getElementById('radarPlayer2Select').value;
    
    const avgData = [
        activePlantillaData.jugadores.reduce((a,b)=>a+b.vel,0)/activePlantillaData.jugadores.length,
        activePlantillaData.jugadores.reduce((a,b)=>a+b.fue,0)/activePlantillaData.jugadores.length,
        activePlantillaData.jugadores.reduce((a,b)=>a+b.res,0)/activePlantillaData.jugadores.length,
        activePlantillaData.jugadores.reduce((a,b)=>a+b.tec,0)/activePlantillaData.jugadores.length
    ];

    let datasets = [];
    if (v1 === 'promedio') {
        datasets.push({ label: 'Promedio Equipo', data: avgData, borderColor: '#00ff66', backgroundColor: 'rgba(0,255,102,0.2)' });
    } else {
        const p1 = activePlantillaData.jugadores[v1];
        if(p1) datasets.push({ label: p1.name, data: [p1.vel, p1.fue, p1.res, p1.tec], borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.3)' });
    }

    if (v2 !== 'ninguno') {
        if (v2 === 'promedio') {
            datasets.push({ label: 'Promedio Equipo', data: avgData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.2)' });
        } else {
            const p2 = activePlantillaData.jugadores[v2];
            if(p2) datasets.push({ label: p2.name, data: [p2.vel, p2.fue, p2.res, p2.tec], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.3)' });
        }
    }

    const pluginBg = {
        id: 'customCanvasBackgroundColor',
        beforeDraw: (chart) => {
            const ctx = chart.canvas.getContext('2d');
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#0f172a'; // oscuro para contraste en PDF
            ctx.fillRect(0, 0, chart.width, chart.height);
            ctx.restore();
        }
    };

    if (radarChartObj) radarChartObj.destroy();
    radarChartObj = new Chart(document.getElementById('chartPlayerRadar'), {
        type: 'radar', data: { labels: ['Vel', 'Fue', 'Res', 'Tec'], datasets },
        plugins: [pluginBg],
        options: { scales: { r: { max: 100, pointLabels: { color:'#cbd5e1' } } } }
    });
}

async function exportarReportePDF() {
    if (currentUser.plan !== 'pro') return showToast("La exportación PDF requiere suscripción PRO ($125/mes)", "error");
    if (!activePlantillaData) return;

    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    doc.setFontSize(20); doc.text(`Reporte Kikesport: ${activePlantillaData.name}`, 15, 20);
    doc.setFontSize(12); doc.text(`Deporte: ${activePlantillaData.deporte} | Jugadores: ${activePlantillaData.jugadores.length}`, 15, 30);
    
    let y = 50; doc.setFontSize(10);
    doc.text("Nombre", 15, 45); doc.text("Posición", 80, 45); doc.text("IMC", 130, 45); doc.text("Promedio", 160, 45);
    doc.line(15, 47, 190, 47);

    // Renderizamos todos los jugadores, creando nueva página si se llena
    activePlantillaData.jugadores.forEach(j => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(j.name.substring(0,25), 15, y); doc.text(j.posicion.substring(0,15), 80, y);
        doc.text(j.imc.toString(), 130, y); doc.text(j.promedio.toString(), 160, y);
        y += 8;
    });

    const canvasRadar = document.getElementById('chartPlayerRadar');
    const imgData = canvasRadar.toDataURL('image/png', 1.0);
    if (y > 170) { doc.addPage(); y = 20; }
    doc.addImage(imgData, 'PNG', 15, y + 10, 100, 100);

    doc.save(`Reporte_${activePlantillaData.name}.pdf`);
    showToast("Reporte PDF generado.");
}

function descargarFormatoExcel() {
    if (!activePlantillaData) return showToast("Selecciona una plantilla primero", "error");
    const excelData = [
        ["Nombre", "Estatura_m", "Peso_kg", "Posicion", "Velocidad", "Fuerza", "Resistencia", "Tecnica"],
        ["Jugador Ejemplo 1", 1.78, 72, SPORT_POSITIONS[activePlantillaData.deporte][0] || "", 85, 80, 78, 90]
    ];
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, `Plantilla_${activePlantillaData.name}.xlsx`);
}

function importarExcel(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
            if (!matrix.length) return showToast("Excel vacío", "error");
            sheetMatrix = matrix; renderHojaCalculo(); sincronizarHojaAJugadores();
        } catch { showToast("Error al leer Excel", "error"); }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// --- INTERFAZ ---
function applyProRestrictions() {
    const isPro = currentUser.plan === 'pro';
    document.getElementById('tabCancha').classList.toggle('pro-locked-overlay', !isPro);
    document.getElementById('tabGraficas').classList.toggle('pro-locked-overlay', !isPro);
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    ['Jugadores', 'HojaCalculo', 'Cancha', 'Graficas'].forEach(t => document.getElementById(`tab${t}`).classList.add('hidden'));
    document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.remove('hidden');
    const idx = {'jugadores':0, 'hojaCalculo':1, 'cancha':2, 'graficas':3}[tabName];
    document.querySelectorAll('.tab-btn')[idx].classList.add('active');
}

function irAlRegistro() {
    const landing = document.getElementById('landingScreen');
    landing.style.opacity = '0';
    setTimeout(() => {
        landing.classList.add('hidden');
        const auth = document.getElementById('authScreen');
        auth.classList.remove('hidden');
        auth.style.animation = 'fadeIn 0.5s ease-out';
    }, 300);
}