const socket = io();

let miNombre = '';
let miSala = '';
let soyHost = false;

// Referencias a elementos del DOM
const pantallaInicial = document.getElementById('pantalla-inicial');
const pantallaLobby = document.getElementById('pantalla-lobby');
const pantallaPersonaje = document.getElementById('pantalla-personaje');
const pantallaRonda = document.getElementById('pantalla-ronda');
const pantallaVotacion = document.getElementById('pantalla-votacion');
const pantallaResultado = document.getElementById('pantalla-resultado');
const pantallaFinal = document.getElementById('pantalla-final');

// Funciones auxiliares
function mostrarPantalla(pantalla) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('active'));
  pantalla.classList.add('active');
}

function mostrarError(mensaje) {
  const toast = document.getElementById('toast');
  toast.textContent = mensaje;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Eventos de pantalla inicial
document.getElementById('btn-crear-sala').addEventListener('click', () => {
  const nombre = document.getElementById('nombre-jugador').value.trim();
  if (!nombre) {
    mostrarError('Por favor ingresa tu nombre');
    return;
  }
  miNombre = nombre;
  socket.emit('crear_sala', nombre);
});

document.getElementById('btn-unirse-sala').addEventListener('click', () => {
  const nombre = document.getElementById('nombre-jugador').value.trim();
  const codigo = document.getElementById('codigo-sala').value.trim().toUpperCase();
  
  if (!nombre || !codigo) {
    mostrarError('Por favor ingresa tu nombre y el código de sala');
    return;
  }
  
  miNombre = nombre;
  socket.emit('unirse_sala', { codigo, nombre });
});

// Eventos de lobby
document.getElementById('btn-iniciar-partida').addEventListener('click', () => {
  socket.emit('iniciar_partida', miSala);
});

document.querySelectorAll('[data-impostores]').forEach(btn => {
  btn.addEventListener('click', function() {
    const num = parseInt(this.dataset.impostores);
    document.querySelectorAll('[data-impostores]').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    socket.emit('cambiar_impostores', { codigo: miSala, num });
  });
});

// Evento de personaje visto
document.getElementById('btn-entendido').addEventListener('click', () => {
  socket.emit('personaje_visto', miSala);
  mostrarPantalla(pantallaRonda);
});

// Evento abrir votación
document.getElementById('btn-abrir-votacion').addEventListener('click', () => {
  socket.emit('abrir_votacion', miSala);
});

// Evento continuar
document.getElementById('btn-continuar').addEventListener('click', () => {
  socket.emit('continuar', miSala);
});

// Evento volver al lobby
document.getElementById('btn-volver-lobby').addEventListener('click', () => {
  socket.emit('volver_lobby', miSala);
});

// Listeners del socket
socket.on('sala_creada', ({ codigo, esHost }) => {
  miSala = codigo;
  soyHost = esHost;
  document.getElementById('codigo-actual').textContent = codigo;
  mostrarPantalla(pantallaLobby);
});

socket.on('sala_unida', ({ codigo, esHost, estado, fase }) => {
  miSala = codigo;
  soyHost = esHost;
  document.getElementById('codigo-actual').textContent = codigo;
  
  if (estado === 'LOBBY') {
    mostrarPantalla(pantallaLobby);
  } else if (estado === 'JUGANDO') {
    // Reconexión durante partida
    if (fase === 'RONDA') {
      mostrarPantalla(pantallaRonda);
    }
  }
});

socket.on('actualizar_lobby', ({ jugadores, esHost, minJugadores, puedeElegirImpostores, numImpostores }) => {
  soyHost = esHost;
  const lista = document.getElementById('lista-jugadores');
  lista.innerHTML = '';
  
  jugadores.forEach(jugador => {
    const div = document.createElement('div');
    div.className = 'jugador-item';
    if (jugador.id === socket.id) {
      div.className += ' host';
    }
    div.textContent = jugador.nombre;
    lista.appendChild(div);
  });
  
  const controlesHost = document.getElementById('controles-host');
  const selectorImpostores = document.getElementById('selector-impostores');
  const btnIniciar = document.getElementById('btn-iniciar-partida');
  
  if (esHost) {
    controlesHost.style.display = 'block';
    
    if (puedeElegirImpostores) {
      selectorImpostores.style.display = 'block';
      // Marcar botón activo
      document.querySelectorAll('[data-impostores]').forEach(btn => {
        if (parseInt(btn.dataset.impostores) === (numImpostores || 1)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    } else {
      selectorImpostores.style.display = 'none';
    }
    
    btnIniciar.disabled = !minJugadores;
    btnIniciar.textContent = minJugadores ? 'Iniciar Partida' : 'Iniciar Partida (mín. 3 jugadores)';
  } else {
    controlesHost.style.display = 'none';
  }
  
  mostrarPantalla(pantallaLobby);
});

socket.on('mostrar_personaje', ({ personaje, esImpostor }) => {
  const titulo = document.getElementById('titulo-personaje');
  const nombre = document.getElementById('nombre-personaje');
  const card = document.getElementById('card-personaje');
  
  if (esImpostor) {
    titulo.textContent = 'Eres el';
    nombre.textContent = '🎭 IMPOSTOR';
    card.classList.add('impostor');
  } else {
    titulo.textContent = 'Tu personaje es:';
    nombre.textContent = personaje;
    card.classList.remove('impostor');
  }
  
  mostrarPantalla(pantallaPersonaje);
});

socket.on('iniciar_ronda', ({ jugadores, esHost }) => {
  const lista = document.getElementById('jugadores-vivos-ronda');
  lista.innerHTML = '<h3>Jugadores Vivos:</h3>';
  
  jugadores.forEach(jugador => {
    const div = document.createElement('div');
    div.className = 'jugador-item';
    div.textContent = jugador.nombre;
    lista.appendChild(div);
  });
  
  const controlesHostRonda = document.getElementById('controles-host-ronda');
  controlesHostRonda.style.display = esHost === socket.id ? 'block' : 'none';
  
  mostrarPantalla(pantallaRonda);
});

socket.on('fase_votacion', ({ jugadores }) => {
  const opciones = document.getElementById('opciones-voto');
  opciones.innerHTML = '';
  
  jugadores.forEach(jugador => {
    const div = document.createElement('div');
    div.className = 'opcion-voto';
    div.textContent = jugador.nombre;
    div.addEventListener('click', () => {
      socket.emit('votar', { codigo: miSala, nombreVotado: jugador.nombre });
      opciones.style.display = 'none';
      document.getElementById('esperando-votos').style.display = 'block';
    });
    opciones.appendChild(div);
  });
  
  document.getElementById('esperando-votos').style.display = 'none';
  mostrarPantalla(pantallaVotacion);
});

socket.on('voto_confirmado', () => {
  document.getElementById('opciones-voto').style.display = 'none';
  document.getElementById('esperando-votos').style.display = 'block';
});

socket.on('contador_votos', ({ votaron, total }) => {
  document.getElementById('contador-votos').textContent = `${votaron}/${total} votos recibidos`;
});

socket.on('resultado_votacion', ({ eliminado, eraImpostor, empate }) => {
  const texto = document.getElementById('texto-resultado');
  const detalle = document.getElementById('detalle-resultado');
  const btnContinuar = document.getElementById('btn-continuar-host');
  
  if (empate) {
    texto.textContent = '🤝 Empate';
    detalle.textContent = 'Nadie fue eliminado';
  } else {
    texto.textContent = `${eliminado} fue eliminado`;
    detalle.textContent = eraImpostor ? '❌ Era IMPOSTOR' : '✅ Era INOCENTE';
  }
  
  btnContinuar.style.display = soyHost ? 'block' : 'none';
  mostrarPantalla(pantallaResultado);
});

socket.on('fin_partida', ({ ganador, impostores }) => {
  const texto = document.getElementById('texto-ganador');
  const listaImpostores = document.getElementById('lista-impostores');
  const card = document.querySelector('.final-card');
  const btnVolver = document.getElementById('btn-volver-host');
  
  if (ganador === 'INOCENTES') {
    texto.textContent = '🎉 ¡Los Inocentes Ganaron!';
    card.classList.remove('impostores-ganan');
  } else {
    texto.textContent = '🎭 ¡Los Impostores Ganaron!';
    card.classList.add('impostores-ganan');
  }
  
  listaImpostores.innerHTML = '<p>Los impostores eran:</p>' + 
    impostores.map(nombre => `<div>${nombre}</div>`).join('');
  
  btnVolver.style.display = soyHost ? 'block' : 'none';
  mostrarPantalla(pantallaFinal);
});

socket.on('nuevo_host', (nombreNuevoHost) => {
  mostrarError(`${nombreNuevoHost} es ahora el host`);
});

socket.on('error', (mensaje) => {
  mostrarError(mensaje);
});
