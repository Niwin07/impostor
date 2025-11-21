const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// Lista de personajes bíblicos
const PERSONAJES = [
  'Adán', 'Eva', 'Noé', 'Abraham', 'Sara', 'Isaac', 'Jacob', 'José', 
  'Moisés', 'Aarón', 'Josué', 'Samuel', 'David', 'Salomón', 'Daniel',
  'Jesús', 'María', 'José (esposo de María)', 'Juan el Bautista', 'Pedro',
  'Juan', 'Santiago', 'Andrés', 'Mateo', 'Felipe', 'Tomás', 'Pablo',
  'María Magdalena', 'Lázaro', 'Zaqueo'
];

// Almacenamiento de salas en memoria
const salas = {};

// Generar código de sala aleatorio
function generarCodigoSala() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Seleccionar personaje aleatorio
function seleccionarPersonaje() {
  return PERSONAJES[Math.floor(Math.random() * PERSONAJES.length)];
}

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Crear sala
  socket.on('crear_sala', (nombre) => {
    const codigo = generarCodigoSala();
    salas[codigo] = {
      codigo,
      estado: 'LOBBY',
      fase: null,
      hostId: socket.id,
      personajeActual: null,
      configuracion: {
        numImpostores: 1
      },
      jugadores: [{
        id: socket.id,
        nombre,
        esImpostor: false,
        estaVivo: true,
        visto_personaje: false,
        voto: null
      }],
      votos_ronda_actual: {},
      eliminado_actual: null
    };

    socket.join(codigo);
    socket.emit('sala_creada', { codigo, esHost: true });
    
    // Enviar actualización DESPUÉS de unirse
    const sala = salas[codigo];
    sala.jugadores.forEach(jugador => {
      io.to(jugador.id).emit('actualizar_lobby', {
        jugadores: sala.jugadores,
        esHost: jugador.id === sala.hostId,
        minJugadores: sala.jugadores.length >= 3,
        puedeElegirImpostores: sala.jugadores.length >= 6
      });
    });
  });

  // Unirse a sala
  socket.on('unirse_sala', ({ codigo, nombre }) => {
    if (!salas[codigo]) {
      socket.emit('error', 'Sala no encontrada');
      return;
    }

    if (salas[codigo].estado !== 'LOBBY') {
      socket.emit('error', 'La partida ya comenzó');
      return;
    }

    // Verificar si el jugador ya está en la sala (reconexión)
    const jugadorExistente = salas[codigo].jugadores.find(j => j.nombre === nombre);
    if (jugadorExistente) {
      jugadorExistente.id = socket.id;
      socket.join(codigo);
      socket.emit('sala_unida', { 
        codigo, 
        esHost: socket.id === salas[codigo].hostId,
        estado: salas[codigo].estado,
        fase: salas[codigo].fase
      });
    } else {
      if (salas[codigo].jugadores.length >= 10) {
        socket.emit('error', 'Sala llena');
        return;
      }

      salas[codigo].jugadores.push({
        id: socket.id,
        nombre,
        esImpostor: false,
        estaVivo: true,
        visto_personaje: false,
        voto: null
      });

      socket.join(codigo);
      socket.emit('sala_unida', { codigo, esHost: false, estado: 'LOBBY' });
    }

    // Enviar actualización DESPUÉS de agregar al jugador
    const sala = salas[codigo];
    sala.jugadores.forEach(jugador => {
      io.to(jugador.id).emit('actualizar_lobby', {
        jugadores: sala.jugadores,
        esHost: jugador.id === sala.hostId,
        minJugadores: sala.jugadores.length >= 3,
        puedeElegirImpostores: sala.jugadores.length >= 6,
        numImpostores: sala.configuracion.numImpostores
      });
    });
  });

  // Cambiar número de impostores
  socket.on('cambiar_impostores', ({ codigo, num }) => {
    if (salas[codigo] && socket.id === salas[codigo].hostId) {
      salas[codigo].configuracion.numImpostores = num;
      
      // Enviar actualización individualizada a cada jugador
      salas[codigo].jugadores.forEach(jugador => {
        io.to(jugador.id).emit('actualizar_lobby', {
          jugadores: salas[codigo].jugadores,
          esHost: jugador.id === salas[codigo].hostId,
          minJugadores: salas[codigo].jugadores.length >= 3,
          puedeElegirImpostores: salas[codigo].jugadores.length >= 6,
          numImpostores: num
        });
      });
    }
  });

  // Iniciar partida
  socket.on('iniciar_partida', (codigo) => {
    if (!salas[codigo] || socket.id !== salas[codigo].hostId) return;
    if (salas[codigo].jugadores.length < 3) return;

    const sala = salas[codigo];
    sala.estado = 'JUGANDO';
    sala.fase = 'MOSTRANDO_PERSONAJE';
    sala.personajeActual = seleccionarPersonaje();

    // Determinar número de impostores
    const numImpostores = sala.jugadores.length < 6 ? 1 : sala.configuracion.numImpostores;

    // Asignar impostores aleatoriamente
    const indices = [...Array(sala.jugadores.length).keys()];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    for (let i = 0; i < numImpostores; i++) {
      sala.jugadores[indices[i]].esImpostor = true;
    }

    // Resetear estados
    sala.jugadores.forEach(j => {
      j.estaVivo = true;
      j.visto_personaje = false;
      j.voto = null;
    });

    // Enviar personajes a cada jugador
    sala.jugadores.forEach(jugador => {
      io.to(jugador.id).emit('mostrar_personaje', {
        personaje: jugador.esImpostor ? null : sala.personajeActual,
        esImpostor: jugador.esImpostor
      });
    });
  });

  // Confirmar que vio el personaje
  socket.on('personaje_visto', (codigo) => {
    if (!salas[codigo]) return;
    const jugador = salas[codigo].jugadores.find(j => j.id === socket.id);
    if (jugador) {
      jugador.visto_personaje = true;
      
      // Verificar si todos vieron su personaje
      const todosVistos = salas[codigo].jugadores.every(j => j.visto_personaje);
      if (todosVistos) {
        salas[codigo].fase = 'RONDA';
        io.to(codigo).emit('iniciar_ronda', {
          jugadores: salas[codigo].jugadores.filter(j => j.estaVivo).map(j => ({
            nombre: j.nombre,
            estaVivo: j.estaVivo
          })),
          esHost: salas[codigo].hostId
        });
      }
    }
  });

  // Abrir votación (solo host)
  socket.on('abrir_votacion', (codigo) => {
    if (!salas[codigo] || socket.id !== salas[codigo].hostId) return;
    
    salas[codigo].fase = 'VOTANDO';
    salas[codigo].votos_ronda_actual = {};
    salas[codigo].jugadores.forEach(j => j.voto = null);

    io.to(codigo).emit('fase_votacion', {
      jugadores: salas[codigo].jugadores.filter(j => j.estaVivo).map(j => ({
        nombre: j.nombre,
        estaVivo: j.estaVivo
      }))
    });
  });

  // Votar
  socket.on('votar', ({ codigo, nombreVotado }) => {
    if (!salas[codigo] || salas[codigo].fase !== 'VOTANDO') return;

    const jugador = salas[codigo].jugadores.find(j => j.id === socket.id && j.estaVivo);
    if (!jugador || jugador.voto) return;

    jugador.voto = nombreVotado;
    salas[codigo].votos_ronda_actual[nombreVotado] = (salas[codigo].votos_ronda_actual[nombreVotado] || 0) + 1;

    socket.emit('voto_confirmado');

    // Verificar si todos votaron
    const jugadoresVivos = salas[codigo].jugadores.filter(j => j.estaVivo);
    const votosCompletos = jugadoresVivos.every(j => j.voto);

    // Notificar al host cuántos votaron
    io.to(salas[codigo].hostId).emit('contador_votos', {
      votaron: jugadoresVivos.filter(j => j.voto).length,
      total: jugadoresVivos.length
    });

    if (votosCompletos) {
      procesarVotacion(codigo);
    }
  });

  // Continuar después del resultado
  socket.on('continuar', (codigo) => {
    if (!salas[codigo] || socket.id !== salas[codigo].hostId) return;

    const sala = salas[codigo];
    const jugadoresVivos = sala.jugadores.filter(j => j.estaVivo);
    const impostoresVivos = jugadoresVivos.filter(j => j.esImpostor).length;
    const inocentesVivos = jugadoresVivos.filter(j => !j.esImpostor).length;

    // Verificar condiciones de victoria
    if (impostoresVivos === 0) {
      finalizarPartida(codigo, 'INOCENTES');
    } else if (impostoresVivos >= inocentesVivos) {
      finalizarPartida(codigo, 'IMPOSTORES');
    } else {
      // Continuar con nueva ronda
      sala.fase = 'RONDA';
      sala.votos_ronda_actual = {};
      sala.jugadores.forEach(j => j.voto = null);

      io.to(codigo).emit('iniciar_ronda', {
        jugadores: jugadoresVivos.map(j => ({
          nombre: j.nombre,
          estaVivo: j.estaVivo
        })),
        esHost: sala.hostId
      });
    }
  });

  // Volver al lobby desde pantalla final
  socket.on('volver_lobby', (codigo) => {
    if (!salas[codigo] || socket.id !== salas[codigo].hostId) return;

    salas[codigo].estado = 'LOBBY';
    salas[codigo].fase = null;
    salas[codigo].personajeActual = null;
    salas[codigo].configuracion.numImpostores = 1;
    salas[codigo].jugadores.forEach(j => {
      j.esImpostor = false;
      j.estaVivo = true;
      j.visto_personaje = false;
      j.voto = null;
    });
    salas[codigo].votos_ronda_actual = {};
    salas[codigo].eliminado_actual = null;

    // Enviar actualización individualizada a cada jugador
    salas[codigo].jugadores.forEach(jugador => {
      io.to(jugador.id).emit('actualizar_lobby', {
        jugadores: salas[codigo].jugadores,
        esHost: jugador.id === salas[codigo].hostId,
        minJugadores: salas[codigo].jugadores.length >= 3,
        puedeElegirImpostores: salas[codigo].jugadores.length >= 6
      });
    });
  });

  // Desconexión
  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);

    // Buscar en qué sala estaba
    for (const codigo in salas) {
      const sala = salas[codigo];
      const jugadorIndex = sala.jugadores.findIndex(j => j.id === socket.id);

      if (jugadorIndex !== -1) {
        // Si era el host, asignar nuevo host
        if (sala.hostId === socket.id && sala.jugadores.length > 1) {
          const nuevoHost = sala.jugadores.find(j => j.id !== socket.id);
          if (nuevoHost) {
            sala.hostId = nuevoHost.id;
            io.to(codigo).emit('nuevo_host', nuevoHost.nombre);
          }
        }

        // No eliminar al jugador, solo marcarlo como desconectado
        // Si se reconecta, recuperará su estado
        
        // Si está en lobby y se desconecta, lo eliminamos
        if (sala.estado === 'LOBBY') {
          sala.jugadores.splice(jugadorIndex, 1);
          
          // Si no quedan jugadores, eliminar sala
          if (sala.jugadores.length === 0) {
            delete salas[codigo];
          } else {
            // Enviar actualización individualizada a cada jugador
            sala.jugadores.forEach(jugador => {
              io.to(jugador.id).emit('actualizar_lobby', {
                jugadores: sala.jugadores,
                esHost: jugador.id === sala.hostId,
                minJugadores: sala.jugadores.length >= 3,
                puedeElegirImpostores: sala.jugadores.length >= 6
              });
            });
          }
        }
      }
    }
  });
});

// Procesar votación
function procesarVotacion(codigo) {
  const sala = salas[codigo];
  const votos = sala.votos_ronda_actual;

  // Encontrar al más votado
  let maxVotos = 0;
  let eliminados = [];

  for (const nombre in votos) {
    if (votos[nombre] > maxVotos) {
      maxVotos = votos[nombre];
      eliminados = [nombre];
    } else if (votos[nombre] === maxVotos) {
      eliminados.push(nombre);
    }
  }

  sala.fase = 'RESULTADO';

  // Si hay empate, nadie es eliminado
  if (eliminados.length > 1 || maxVotos === 0) {
    io.to(codigo).emit('resultado_votacion', {
      eliminado: null,
      empate: true
    });
  } else {
    const nombreEliminado = eliminados[0];
    const jugadorEliminado = sala.jugadores.find(j => j.nombre === nombreEliminado);
    jugadorEliminado.estaVivo = false;

    io.to(codigo).emit('resultado_votacion', {
      eliminado: nombreEliminado,
      eraImpostor: jugadorEliminado.esImpostor,
      empate: false
    });
  }
}

// Finalizar partida
function finalizarPartida(codigo, ganador) {
  const sala = salas[codigo];
  sala.estado = 'FINALIZADO';

  const impostores = sala.jugadores.filter(j => j.esImpostor).map(j => j.nombre);

  io.to(codigo).emit('fin_partida', {
    ganador,
    impostores
  });
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
