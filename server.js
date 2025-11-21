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

const salas = {};

function generarCodigoSala() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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
      hostId: socket.id,
      configuracion: { numImpostores: 1 },
      jugadores: [{
        id: socket.id,
        nombre,
        esImpostor: false
      }]
    };

    socket.join(codigo);
    socket.emit('sala_creada', { codigo, esHost: true });
    actualizarSala(codigo);
  });

  // Unirse a sala
  socket.on('unirse_sala', ({ codigo, nombre }) => {
    if (!salas[codigo]) {
      socket.emit('error', 'Sala no encontrada');
      return;
    }
    if (salas[codigo].estado !== 'LOBBY') {
      socket.emit('error', 'La partida ya está en curso');
      return;
    }

    const jugadorExistente = salas[codigo].jugadores.find(j => j.nombre === nombre);
    if (jugadorExistente) {
      // Reconexión simple
      jugadorExistente.id = socket.id;
      socket.join(codigo);
      socket.emit('sala_unida', { codigo, esHost: socket.id === salas[codigo].hostId });
    } else {
      if (salas[codigo].jugadores.length >= 10) {
        socket.emit('error', 'Sala llena');
        return;
      }
      salas[codigo].jugadores.push({
        id: socket.id,
        nombre,
        esImpostor: false
      });
      socket.join(codigo);
      socket.emit('sala_unida', { codigo, esHost: false });
    }
    actualizarSala(codigo);
  });

  // Cambiar configuración (Impostores)
  socket.on('cambiar_impostores', ({ codigo, num }) => {
    if (salas[codigo] && socket.id === salas[codigo].hostId) {
      salas[codigo].configuracion.numImpostores = num;
      actualizarSala(codigo);
    }
  });

  // --- INICIAR PARTIDA (Solo asigna roles) ---
  socket.on('iniciar_partida', (codigo) => {
    if (!salas[codigo] || socket.id !== salas[codigo].hostId) return;
    
    const sala = salas[codigo];
    sala.estado = 'JUGANDO';
    
    // 1. Seleccionar personaje común
    const personajeComun = seleccionarPersonaje();

    // 2. Asignar Impostores
    const numImpostores = sala.jugadores.length < 6 ? 1 : sala.configuracion.numImpostores;
    const indices = [...Array(sala.jugadores.length).keys()];
    
    // Shuffle manual
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Resetear roles
    sala.jugadores.forEach(j => j.esImpostor = false);

    // Marcar impostores
    for (let i = 0; i < numImpostores; i++) {
      sala.jugadores[indices[i]].esImpostor = true;
    }

    // 3. Enviar roles a cada uno
    sala.jugadores.forEach(jugador => {
      io.to(jugador.id).emit('mostrar_personaje', {
        personaje: jugador.esImpostor ? null : personajeComun,
        esImpostor: jugador.esImpostor
      });
    });
  });

  // --- FINALIZAR PARTIDA (Vuelve al lobby) ---
  socket.on('finalizar_partida', (codigo) => {
    if (!salas[codigo] || socket.id !== salas[codigo].hostId) return;

    const sala = salas[codigo];
    sala.estado = 'LOBBY';
    
    // Resetear jugadores
    sala.jugadores.forEach(j => {
      j.esImpostor = false;
    });

    io.to(codigo).emit('partida_finalizada');
    actualizarSala(codigo);
  });

  socket.on('disconnect', () => {
    // Lógica básica de desconexión
    for (const codigo in salas) {
      const sala = salas[codigo];
      const index = sala.jugadores.findIndex(j => j.id === socket.id);
      
      if (index !== -1) {
        if (sala.estado === 'LOBBY') {
          sala.jugadores.splice(index, 1);
          if (sala.jugadores.length === 0) {
            delete salas[codigo];
          } else {
            if (sala.hostId === socket.id) {
              sala.hostId = sala.jugadores[0].id; // Nuevo host
            }
            actualizarSala(codigo);
          }
        }
      }
    }
  });
});

function actualizarSala(codigo) {
  if (!salas[codigo]) return;
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
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
