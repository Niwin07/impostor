const socket = io();
let miSala = '';
let soyHost = false;

// Referencias DOM
const pantallaInicial = document.getElementById('pantalla-inicial');
const pantallaLobby = document.getElementById('pantalla-lobby');
const pantallaPersonaje = document.getElementById('pantalla-personaje');

function mostrarPantalla(pantalla) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('active'));
  pantalla.classList.add('active');
}

function mostrarError(mensaje) {
  const toast = document.getElementById('toast');
  toast.textContent = mensaje;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- EVENTOS INICIALES ---
document.getElementById('btn-crear-sala').addEventListener('click', () => {
  const nombre = document.getElementById('nombre-jugador').value.trim();
  if (!nombre) return mostrarError('Ingresa tu nombre');
  socket.emit('crear_sala', nombre);
});

document.getElementById('btn-unirse-sala').addEventListener('click', () => {
  const nombre = document.getElementById('nombre-jugador').value.trim();
  const codigo = document.getElementById('codigo-sala').value.trim().toUpperCase();
  if (!nombre || !codigo) return mostrarError('Faltan datos');
  socket.emit('unirse_sala', { codigo, nombre });
});

// --- EVENTOS LOBBY ---
document.getElementById('btn-iniciar-partida').addEventListener('click', () => {
  socket.emit('iniciar_partida', miSala);
});

document.querySelectorAll('[data-impostores]').forEach(btn => {
  btn.addEventListener('click', function() {
    const num = parseInt(this.dataset.impostores);
    socket.emit('cambiar_impostores', { codigo: miSala, num });
  });
});

// --- EVENTO FINALIZAR (Solo Host) ---
document.getElementById('btn-finalizar-partida').addEventListener('click', () => {
  if (confirm('¿Volver al lobby y reiniciar roles?')) {
    socket.emit('finalizar_partida', miSala);
  }
});

// --- SOCKET LISTENERS ---

socket.on('sala_creada', ({ codigo, esHost }) => {
  miSala = codigo;
  soyHost = esHost;
  document.getElementById('codigo-actual').textContent = codigo;
  mostrarPantalla(pantallaLobby);
});

socket.on('sala_unida', ({ codigo, esHost }) => {
  miSala = codigo;
  soyHost = esHost;
  document.getElementById('codigo-actual').textContent = codigo;
  mostrarPantalla(pantallaLobby);
});

socket.on('actualizar_lobby', ({ jugadores, esHost, minJugadores, puedeElegirImpostores, numImpostores }) => {
  soyHost = esHost;
  const lista = document.getElementById('lista-jugadores');
  lista.innerHTML = '';
  
  jugadores.forEach(jugador => {
    const div = document.createElement('div');
    div.className = 'jugador-item ' + (jugador.id === jugadores[0].id ? 'host' : '');
    div.textContent = jugador.nombre;
    lista.appendChild(div);
  });
  
  // Controles del Host
  const controlesHost = document.getElementById('controles-host');
  const btnIniciar = document.getElementById('btn-iniciar-partida');
  
  if (esHost) {
    controlesHost.style.display = 'block';
    document.getElementById('selector-impostores').style.display = puedeElegirImpostores ? 'block' : 'none';
    
    // Actualizar botones de impostores
    document.querySelectorAll('[data-impostores]').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.impostores) === (numImpostores || 1));
    });

    btnIniciar.disabled = !minJugadores;
    btnIniciar.textContent = minJugadores ? 'Iniciar Partida' : 'Esperando jugadores (mín 3)...';
  } else {
    controlesHost.style.display = 'none';
  }
});

socket.on('mostrar_personaje', ({ personaje, esImpostor }) => {
  const titulo = document.getElementById('titulo-personaje');
  const nombre = document.getElementById('nombre-personaje');
  const card = document.getElementById('card-personaje');
  const btnFinalizar = document.getElementById('controles-finalizar');
  
  if (esImpostor) {
    titulo.textContent = 'Eres el';
    nombre.textContent = '🎭 IMPOSTOR';
    card.className = 'card-grande impostor';
  } else {
    titulo.textContent = 'Tu personaje es:';
    nombre.textContent = personaje;
    card.className = 'card-grande';
  }
  
  // Mostrar botón de finalizar SOLO si es Host
  btnFinalizar.style.display = soyHost ? 'block' : 'none';
  
  mostrarPantalla(pantallaPersonaje);
});

socket.on('partida_finalizada', () => {
  mostrarPantalla(pantallaLobby);
});

socket.on('error', (msg) => mostrarError(msg));
