const { createServer } = require("http");
const { Server } = require("socket.io");

const port = process.env.PORT || 3001;
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : ["http://localhost:3000"];

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Game state
const waitingPlayers = [];
const activeGames = new Map();
const matchmakingTimers = new Map();

// Online matchmaking queues: key = gameMode (e.g. "1v1", "2v2", "5v5")
const matchmakingQueues = new Map(); // gameMode -> [{ socket, playerData }]
const onlineUsers = new Map(); // socketId -> userId
const userSockets = new Map(); // userId -> socketId
const gameInvites = new Map(); // inviteId -> invite data
const gameLobbies = new Map(); // lobbyId -> lobby data
const userLobbies = new Map(); // odrediserId -> lobbyId

io.on("connection", (socket) => {
  // Handle user online status
  socket.on("user-online", (data) => {
    if (data && data.userId) {
      // Remove old socket mapping if exists (reconnection)
      const oldSocketId = userSockets.get(data.userId);
      if (oldSocketId && oldSocketId !== socket.id) {
        onlineUsers.delete(oldSocketId);
      }

      onlineUsers.set(socket.id, data.userId);
      userSockets.set(data.userId, socket.id);

      // Update lobby socket ID if user is in a lobby (handles reconnection)
      const lobbyId = userLobbies.get(data.userId);
      if (lobbyId) {
        const lobby = gameLobbies.get(lobbyId);
        if (lobby) {
          const lobbyPlayer = lobby.players.find(
            (p) => p.odrediserId === data.userId
          );
          if (lobbyPlayer) {
            lobbyPlayer.odrediserSocketId = socket.id;
          }
        }
      }

      const onlineUserIds = Array.from(userSockets.keys());
      io.emit("online-users", onlineUserIds);
      io.emit("user-status-changed", { userId: data.userId, online: true });
    }
  });

  // Handle game invitations
  socket.on("game-invite", (data) => {
    const { friendId, gameType } = data;
    const senderId = onlineUsers.get(socket.id);

    if (!senderId) {
      socket.emit("error", { message: "You must be logged in to send invites" });
      return;
    }

    const friendSocketId = userSockets.get(friendId);
    if (!friendSocketId) {
      socket.emit("error", { message: "Friend is not online" });
      return;
    }

    const inviteId = `invite-${Date.now()}`;
    const invite = {
      id: inviteId,
      senderId,
      receiverId: friendId,
      gameType,
      createdAt: Date.now(),
    };

    gameInvites.set(inviteId, invite);

    io.to(friendSocketId).emit("game-invite-received", {
      inviteId,
      senderId,
      gameType,
    });
  });

  // Accept game invitation - creates a lobby
  socket.on("accept-invite", (data) => {
    const { inviteId } = data;
    const invite = gameInvites.get(inviteId);

    if (!invite) {
      socket.emit("error", { message: "Invite not found or expired" });
      return;
    }

    const senderSocketId = userSockets.get(invite.senderId);
    if (!senderSocketId) {
      socket.emit("error", { message: "Inviter is no longer online" });
      gameInvites.delete(inviteId);
      return;
    }

    const lobbyId = `lobby-${Date.now()}`;
    const receiverId = onlineUsers.get(socket.id);

    const lobby = {
      id: lobbyId,
      gameType: invite.gameType,
      hostId: invite.senderId,
      createdAt: Date.now(),
      players: [
        { odrediserId: invite.senderId, odrediserSocketId: senderSocketId, ready: false },
        { odrediserId: receiverId, odrediserSocketId: socket.id, ready: false },
      ],
      status: "waiting",
      fillMode: "bots",
      botDifficulty: "medium",
    };

    gameLobbies.set(lobbyId, lobby);
    userLobbies.set(invite.senderId, lobbyId);
    userLobbies.set(receiverId, lobbyId);

    const lobbyData = {
      lobbyId,
      gameType: invite.gameType,
      players: lobby.players.map((p) => ({
        odrediserId: p.odrediserId,
        ready: p.ready,
      })),
      hostId: invite.senderId,
      status: lobby.status,
      fillMode: lobby.fillMode,
      botDifficulty: lobby.botDifficulty,
    };

    io.to(senderSocketId).emit("lobby-created", lobbyData);
    socket.emit("lobby-created", lobbyData);

    gameInvites.delete(inviteId);
  });

  // Reject game invitation
  socket.on("reject-invite", (data) => {
    const { inviteId } = data;
    const invite = gameInvites.get(inviteId);

    if (invite) {
      const senderSocketId = userSockets.get(invite.senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit("invite-rejected", { inviteId });
      }
      gameInvites.delete(inviteId);
    }
  });

  // Host sets fill mode
  socket.on("lobby-set-fill-mode", (data) => {
    const { lobbyId, fillMode } = data;
    const userId = onlineUsers.get(socket.id);
    const lobby = gameLobbies.get(lobbyId);
    if (!lobby || lobby.hostId !== userId) return;
    if (!["bots", "players"].includes(fillMode)) return;
    lobby.fillMode = fillMode;

    const lobbyData = {
      lobbyId,
      gameType: lobby.gameType,
      players: lobby.players.map((p) => ({
        odrediserId: p.odrediserId,
        ready: p.ready,
      })),
      hostId: lobby.hostId,
      status: lobby.status,
      fillMode: lobby.fillMode,
      botDifficulty: lobby.botDifficulty,
    };
    lobby.players.forEach((p) => {
      io.to(p.odrediserSocketId).emit("lobby-updated", lobbyData);
    });
  });

  // Host sets bot difficulty
  socket.on("lobby-set-bot-difficulty", (data) => {
    const { lobbyId, botDifficulty } = data;
    const userId = onlineUsers.get(socket.id);
    const lobby = gameLobbies.get(lobbyId);
    if (!lobby || lobby.hostId !== userId) return;
    if (!["easy", "medium", "hard"].includes(botDifficulty)) return;
    lobby.botDifficulty = botDifficulty;

    const lobbyData = {
      lobbyId,
      gameType: lobby.gameType,
      players: lobby.players.map((p) => ({
        odrediserId: p.odrediserId,
        ready: p.ready,
      })),
      hostId: lobby.hostId,
      status: lobby.status,
      fillMode: lobby.fillMode,
      botDifficulty: lobby.botDifficulty,
    };
    lobby.players.forEach((p) => {
      io.to(p.odrediserSocketId).emit("lobby-updated", lobbyData);
    });
  });

  // Player ready in lobby
  socket.on("lobby-ready", (data) => {
    const { lobbyId } = data;
    const odrediserId = onlineUsers.get(socket.id);
    const lobby = gameLobbies.get(lobbyId);

    if (!lobby) {
      socket.emit("error", { message: "Lobby not found" });
      return;
    }

    if (lobby.status !== "waiting") return;

    const player = lobby.players.find((p) => p.odrediserId === odrediserId);
    if (player) {
      player.ready = !player.ready;
    }

    const lobbyData = {
      lobbyId,
      gameType: lobby.gameType,
      players: lobby.players.map((p) => ({
        odrediserId: p.odrediserId,
        ready: p.ready,
      })),
      hostId: lobby.hostId,
      status: lobby.status,
      fillMode: lobby.fillMode,
      botDifficulty: lobby.botDifficulty,
    };

    lobby.players.forEach((p) => {
      io.to(p.odrediserSocketId).emit("lobby-updated", lobbyData);
    });

    const allReady = lobby.players.every((p) => p.ready);
    if (allReady) {
      if (lobby.fillMode === "players" && lobby.gameType !== "1v1") {
        enterLobbyMatchmaking(lobbyId);
      } else {
        lobby.status = "countdown";
        lobby.countdownStart = Date.now();

        lobby.players.forEach((p) => {
          io.to(p.odrediserSocketId).emit("lobby-countdown", { lobbyId, seconds: 3 });
        });

        setTimeout(() => {
          const currentLobby = gameLobbies.get(lobbyId);
          if (currentLobby && currentLobby.status === "countdown") {
            startGameFromLobby(lobbyId);
          }
        }, 3000);
      }
    }
  });

  // Leave lobby
  socket.on("lobby-leave", (data) => {
    const { lobbyId } = data;
    const odrediserId = onlineUsers.get(socket.id);
    leaveLobby(odrediserId, lobbyId);
  });

  // Join a game from lobby
  socket.on("join-lobby-game", (data) => {
    const { gameId, odrediserId } = data;
    const game = activeGames.get(gameId);

    if (!game) {
      socket.emit("error", { message: "Game not found" });
      return;
    }

    const playerEntry = Object.entries(game.players).find(([, player]) => player.odrediserId === odrediserId);

    if (playerEntry) {
      const [oldPlayerId, playerData] = playerEntry;
      const alreadyConnected = playerData.connected;

      // Swap socket ID (even if same socket, update to current)
      if (oldPlayerId !== socket.id) {
        delete game.players[oldPlayerId];
      }
      game.players[socket.id] = {
        ...playerData,
        id: socket.id,
        connected: true,
      };

      // Only increment connectedHumans if this is the first connection (not a retry)
      if (!alreadyConnected) {
        game.connectedHumans = (game.connectedHumans || 0) + 1;
      }

      socket.join(gameId);

      socket.emit("lobby-game-joined", {
        gameId,
        playerId: socket.id,
        gameState: serializeGameState(game),
      });

      // Broadcast connection status to all players in the game
      io.to(gameId).emit("game-connection-status", {
        connectedHumans: game.connectedHumans,
        expectedHumans: game.expectedHumans || 0,
      });

      // If all humans connected, reset grace period to 5s from now
      if (game.expectedHumans && game.connectedHumans >= game.expectedHumans) {
        game.gracePeriodEnd = Date.now() + 5000;
        io.to(gameId).emit("game-all-connected", { countdownSeconds: 5 });
      }
    } else {
      socket.emit("error", { message: "Player not found in game" });
    }
  });

  // Ping measurement
  socket.on("ping-check", (data) => {
    socket.emit("pong-check", { timestamp: data.timestamp });

    // Store ping for game state
    if (data.ping !== undefined) {
      activeGames.forEach((game) => {
        if (game.players[socket.id]) {
          if (!game.playerPings) game.playerPings = {};
          game.playerPings[socket.id] = data.ping;
        }
      });
    }
  });

  socket.on("find-match", (data) => {
    const gameMode = data.gameMode || "5v5";
    const playMode = data.playMode || "offline";

    if (playMode === "online") {
      joinMatchmakingQueue(socket, data, gameMode);
    } else {
      // Offline: instant game with bots
      if (gameMode === "1v1") {
        create1v1Game(socket, data);
      } else if (gameMode === "2v2") {
        create2v2Game(socket, data);
      } else {
        create5v5Game(socket, data);
      }
    }
  });

  socket.on("cancel-matchmaking", () => {
    removeFromAllQueues(socket);
    socket.emit("matchmaking-cancelled");
  });

  socket.on("update-direction", (data) => {
    const game = activeGames.get(data.gameId);
    if (!game || !game.players[socket.id]) return;

    const player = game.players[socket.id];
    if (!player.alive) return;

    const magnitude = Math.sqrt(data.direction.x ** 2 + data.direction.y ** 2);
    if (magnitude > 0) {
      player.direction = {
        x: data.direction.x / magnitude,
        y: data.direction.y / magnitude,
      };
    }
  });

  socket.on("disconnect", () => {
    const userId = onlineUsers.get(socket.id);
    if (userId) {
      // If user is in a matchmaking lobby, leave it (cleans up queue too)
      const lobbyId = userLobbies.get(userId);
      if (lobbyId) {
        const lobby = gameLobbies.get(lobbyId);
        if (lobby && lobby.status === "matchmaking") {
          leaveLobby(userId, lobbyId);
        }
      }

      onlineUsers.delete(socket.id);
      userSockets.delete(userId);

      const onlineUserIds = Array.from(userSockets.keys());
      io.emit("online-users", onlineUserIds);
      io.emit("user-status-changed", { userId, online: false });
    }

    // Remove from matchmaking queues
    removeFromAllQueues(socket);

    if (matchmakingTimers.has(socket.id)) {
      clearTimeout(matchmakingTimers.get(socket.id));
      matchmakingTimers.delete(socket.id);
    }

    const waitingIndex = waitingPlayers.findIndex((p) => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    activeGames.forEach((game, gameId) => {
      if (game.players[socket.id]) {
        const inGracePeriod = game.gracePeriodEnd && Date.now() < game.gracePeriodEnd;
        const notConnectedYet = !game.players[socket.id].connected;

        if (inGracePeriod || notConnectedYet) {
          return; // Don't mark as dead, they're reconnecting
        }

        game.players[socket.id].alive = false;
        io.to(gameId).emit("player-disconnected", socket.id);
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ONLINE MATCHMAKING
// ════════════════════════════════════════════════════════════════════════════

const REQUIRED_PLAYERS = { "1v1": 2, "2v2": 4, "5v5": 10 };

function removeFromAllQueues(socket) {
  for (const [mode, queue] of matchmakingQueues.entries()) {
    const idx = queue.findIndex((p) => p.socket.id === socket.id);
    if (idx !== -1) {
      queue.splice(idx, 1);
      // Notify remaining players in queue about updated count
      queue.forEach((p) => {
        p.socket.emit("queue-update", {
          playersInQueue: queue.length,
          playersNeeded: REQUIRED_PLAYERS[mode] || 10,
        });
      });
    }
  }
}

function joinMatchmakingQueue(socket, playerData, gameMode) {
  if (!matchmakingQueues.has(gameMode)) {
    matchmakingQueues.set(gameMode, []);
  }

  const queue = matchmakingQueues.get(gameMode);

  // Don't add if already in queue
  if (queue.find((p) => p.socket.id === socket.id)) return;

  queue.push({ socket, playerData });

  const needed = REQUIRED_PLAYERS[gameMode] || 10;

  // Notify all players in queue
  queue.forEach((p) => {
    p.socket.emit("queue-update", {
      playersInQueue: queue.length,
      playersNeeded: needed,
    });
  });

  // Check if we have enough players
  if (queue.length >= needed) {
    startOnlineGame(gameMode, queue.splice(0, needed));
  }
}

function startOnlineGame(gameMode, matchedPlayers) {
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const players = {};
  const teamSize = matchedPlayers.length / 2;

  const getSpawnPosition = (team) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 600 + Math.random() * 300;
    const side = team === "green" ? -1 : 1;
    return {
      x: Math.cos(angle) * radius * side * 1.2,
      y: Math.sin(angle) * radius,
    };
  };

  // Assign first half to green, second half to red
  matchedPlayers.forEach((entry, i) => {
    const team = i < teamSize ? "green" : "red";
    const pos = getSpawnPosition(team);
    players[entry.socket.id] = {
      id: entry.socket.id,
      username: entry.playerData.username || "Player",
      x: pos.x,
      y: pos.y,
      segments: [{ x: pos.x, y: pos.y }],
      direction: { x: team === "green" ? 1 : -1, y: 0 },
      score: 0,
      color: team === "green" ? "#00e701" : "#ff4444",
      alive: true,
      betAmount: entry.playerData.betAmount || 0,
      isBot: false,
      team,
    };
  });

  const foodCount = gameMode === "1v1" ? 100 : gameMode === "2v2" ? 120 : 150;
  const gameState = {
    id: gameId,
    players,
    food: generateFood(foodCount),
    startTime: Date.now(),
    botDifficulty: "medium",
    botPositionHistory: {},
  };

  activeGames.set(gameId, gameState);

  // Join all players to the game room and notify them
  matchedPlayers.forEach((entry) => {
    entry.socket.join(gameId);
    entry.socket.emit("match-found", {
      gameId,
      playerId: entry.socket.id,
      gameState: serializeGameState(gameState),
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// GAME CREATION FUNCTIONS (OFFLINE / BOT GAMES)
// ════════════════════════════════════════════════════════════════════════════

function create5v5Game(socket, playerData) {
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const players = {};

  const getSpawnPosition = (team) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 600 + Math.random() * 300;
    const side = team === "green" ? -1 : 1;
    return {
      x: Math.cos(angle) * radius * side * 1.2,
      y: Math.sin(angle) * radius,
    };
  };

  const playerPos = getSpawnPosition("green");
  players[socket.id] = {
    id: socket.id,
    username: playerData.username || "Player",
    x: playerPos.x,
    y: playerPos.y,
    segments: [{ x: playerPos.x, y: playerPos.y }],
    direction: { x: 1, y: 0 },
    score: 0,
    color: "#00e701",
    alive: true,
    betAmount: playerData.betAmount || 0,
    isBot: false,
    team: "green",
  };

  for (let i = 1; i <= 4; i++) {
    const botId = `green-bot-${gameId}-${i}`;
    const botPos = getSpawnPosition("green");
    players[botId] = {
      id: botId,
      username: `Bot ${i}`,
      x: botPos.x,
      y: botPos.y,
      segments: [{ x: botPos.x, y: botPos.y }],
      direction: { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 },
      score: 0,
      color: "#00e701",
      alive: true,
      betAmount: 0,
      isBot: true,
      team: "green",
    };
  }

  for (let i = 5; i <= 9; i++) {
    const botId = `red-bot-${gameId}-${i}`;
    const botPos = getSpawnPosition("red");
    players[botId] = {
      id: botId,
      username: `Bot ${i}`,
      x: botPos.x,
      y: botPos.y,
      segments: [{ x: botPos.x, y: botPos.y }],
      direction: { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 },
      score: 0,
      color: "#ff4444",
      alive: true,
      betAmount: 0,
      isBot: true,
      team: "red",
    };
  }

  const gameState = {
    id: gameId,
    players,
    food: generateFood(150),
    startTime: Date.now(),
    botDifficulty: playerData.botDifficulty || "medium",
    botPositionHistory: {},
  };

  activeGames.set(gameId, gameState);
  socket.join(gameId);

  socket.emit("match-found", {
    gameId,
    playerId: socket.id,
    gameState: serializeGameState(gameState),
  });
}

function create1v1Game(socket, playerData) {
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const players = {};

  const getSpawnPosition = (team) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 500 + Math.random() * 200;
    const side = team === "green" ? -1 : 1;
    return {
      x: Math.cos(angle) * radius * side,
      y: Math.sin(angle) * radius,
    };
  };

  const playerPos = getSpawnPosition("green");
  players[socket.id] = {
    id: socket.id,
    username: playerData.username || "Player",
    x: playerPos.x,
    y: playerPos.y,
    segments: [{ x: playerPos.x, y: playerPos.y }],
    direction: { x: 1, y: 0 },
    score: 0,
    color: "#00e701",
    alive: true,
    betAmount: playerData.betAmount || 0,
    isBot: false,
    team: "green",
  };

  const botId = `red-bot-${gameId}-1`;
  const botPos = getSpawnPosition("red");
  players[botId] = {
    id: botId,
    username: "Enemy Bot",
    x: botPos.x,
    y: botPos.y,
    segments: [{ x: botPos.x, y: botPos.y }],
    direction: { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 },
    score: 0,
    color: "#ff4444",
    alive: true,
    betAmount: 0,
    isBot: true,
    team: "red",
  };

  const gameState = {
    id: gameId,
    players,
    food: generateFood(100),
    startTime: Date.now(),
    botDifficulty: playerData.botDifficulty || "medium",
    botPositionHistory: {},
  };

  activeGames.set(gameId, gameState);
  socket.join(gameId);

  socket.emit("match-found", {
    gameId,
    playerId: socket.id,
    gameState: serializeGameState(gameState),
  });
}

function create2v2Game(socket, playerData) {
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const players = {};

  const getSpawnPosition = (team) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 600 + Math.random() * 200;
    const side = team === "green" ? -1 : 1;
    return {
      x: Math.cos(angle) * radius * side,
      y: Math.sin(angle) * radius,
    };
  };

  const playerPos = getSpawnPosition("green");
  players[socket.id] = {
    id: socket.id,
    username: playerData.username || "Player",
    x: playerPos.x,
    y: playerPos.y,
    segments: [{ x: playerPos.x, y: playerPos.y }],
    direction: { x: 1, y: 0 },
    score: 0,
    color: "#00e701",
    alive: true,
    betAmount: playerData.betAmount || 0,
    isBot: false,
    team: "green",
  };

  const greenBotId = `green-bot-${gameId}-1`;
  const greenBotPos = getSpawnPosition("green");
  players[greenBotId] = {
    id: greenBotId,
    username: "Teammate Bot",
    x: greenBotPos.x,
    y: greenBotPos.y,
    segments: [{ x: greenBotPos.x, y: greenBotPos.y }],
    direction: { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 },
    score: 0,
    color: "#00e701",
    alive: true,
    betAmount: 0,
    isBot: true,
    team: "green",
  };

  for (let i = 1; i <= 2; i++) {
    const botId = `red-bot-${gameId}-${i}`;
    const botPos = getSpawnPosition("red");
    players[botId] = {
      id: botId,
      username: `Enemy Bot ${i}`,
      x: botPos.x,
      y: botPos.y,
      segments: [{ x: botPos.x, y: botPos.y }],
      direction: { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 },
      score: 0,
      color: "#ff4444",
      alive: true,
      betAmount: 0,
      isBot: true,
      team: "red",
    };
  }

  const gameState = {
    id: gameId,
    players,
    food: generateFood(120),
    startTime: Date.now(),
    botDifficulty: playerData.botDifficulty || "medium",
    botPositionHistory: {},
  };

  activeGames.set(gameId, gameState);
  socket.join(gameId);

  socket.emit("match-found", {
    gameId,
    playerId: socket.id,
    gameState: serializeGameState(gameState),
  });
}

const PLAYERS_PER_TEAM = { "1v1": 1, "2v2": 2, "5v5": 5 };

function startGameFromLobby(lobbyId) {
  const lobby = gameLobbies.get(lobbyId);
  if (!lobby) return;

  lobby.status = "started";

  const gameId = `game-${Date.now()}`;
  const players = {};

  const getSpawnPosition = (team) => {
    const radius = 300 + Math.random() * 200;
    const angleRange = Math.PI * 0.6;
    const baseAngle = team === "green" ? Math.PI : 0;
    const angle = baseAngle + (Math.random() - 0.5) * angleRange;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  };

  // Assign human players: 1v1 = opponents, 2v2/5v5 = both on green (teammates)
  lobby.players.forEach((lobbyPlayer, index) => {
    const team = lobby.gameType === "1v1"
      ? (index === 0 ? "green" : "red")
      : "green";
    const pos = getSpawnPosition(team);
    const odrediserSocket = io.sockets.sockets.get(lobbyPlayer.odrediserSocketId);

    players[lobbyPlayer.odrediserSocketId] = {
      id: lobbyPlayer.odrediserSocketId,
      odrediserId: lobbyPlayer.odrediserId,
      username: lobbyPlayer.odrediserId || `Player ${index + 1}`,
      x: pos.x,
      y: pos.y,
      segments: [{ x: pos.x, y: pos.y }],
      direction: { x: team === "green" ? 1 : -1, y: 0 },
      score: 0,
      color: team === "green" ? "#00e701" : "#ff4444",
      alive: true,
      betAmount: 0,
      isBot: false,
      team,
    };

    if (odrediserSocket) {
      odrediserSocket.join(gameId);
    }
  });

  // Fill remaining slots with bots for each team
  const teamSize = PLAYERS_PER_TEAM[lobby.gameType] || 1;
  ["green", "red"].forEach((team) => {
    const humansOnTeam = Object.values(players).filter((p) => !p.isBot && p.team === team).length;
    const botsNeeded = teamSize - humansOnTeam;
    for (let i = 1; i <= botsNeeded; i++) {
      const botId = `${team}-bot-${gameId}-${i}`;
      const pos = getSpawnPosition(team);
      players[botId] = {
        id: botId,
        username: `${team === "green" ? "Green" : "Red"} Bot ${botsNeeded > 1 ? i : ""}`.trim(),
        x: pos.x,
        y: pos.y,
        segments: [{ x: pos.x, y: pos.y }],
        direction: { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 },
        score: 0,
        color: team === "green" ? "#00e701" : "#ff4444",
        alive: true,
        betAmount: 0,
        isBot: true,
        team,
      };
    }
  });

  const foodCount = lobby.gameType === "5v5" ? 150 : lobby.gameType === "2v2" ? 120 : 100;
  const gameState = {
    id: gameId,
    players,
    food: generateFood(foodCount),
    startTime: Date.now(),
    botDifficulty: lobby.botDifficulty || "medium",
    lobbyId,
    gracePeriodEnd: Date.now() + 5000,
    expectedHumans: lobby.players.length,
    connectedHumans: 0,
    playerPings: {},
  };

  activeGames.set(gameId, gameState);

  lobby.players.forEach((lobbyPlayer) => {
    io.to(lobbyPlayer.odrediserSocketId).emit("lobby-game-start", {
      lobbyId,
      gameId,
      playerId: lobbyPlayer.odrediserSocketId,
      gameType: lobby.gameType,
    });
  });

  setTimeout(() => {
    lobby.players.forEach((p) => {
      userLobbies.delete(p.odrediserId);
    });
    gameLobbies.delete(lobbyId);
  }, 5000);
}

function enterLobbyMatchmaking(lobbyId) {
  const lobby = gameLobbies.get(lobbyId);
  if (!lobby) return;

  lobby.status = "matchmaking";

  // Notify lobby players
  lobby.players.forEach((p) => {
    io.to(p.odrediserSocketId).emit("lobby-matchmaking-started", { lobbyId });
  });

  const gameMode = lobby.gameType;
  const needed = REQUIRED_PLAYERS[gameMode] || 10;

  if (!matchmakingQueues.has(gameMode)) {
    matchmakingQueues.set(gameMode, []);
  }
  const queue = matchmakingQueues.get(gameMode);

  // Add lobby players to the matchmaking queue, tagged with lobbyId
  lobby.players.forEach((lobbyPlayer) => {
    const playerSocket = io.sockets.sockets.get(lobbyPlayer.odrediserSocketId);
    if (playerSocket && !queue.find((p) => p.socket.id === playerSocket.id)) {
      queue.push({
        socket: playerSocket,
        playerData: { username: lobbyPlayer.odrediserId, betAmount: 0 },
        lobbyId,
        lobbyTeam: "green",
      });
    }
  });

  // Notify all in queue
  queue.forEach((p) => {
    p.socket.emit("queue-update", {
      playersInQueue: queue.length,
      playersNeeded: needed,
    });
  });

  // Check if enough players to start
  if (queue.length >= needed) {
    const matchedPlayers = queue.splice(0, needed);
    startOnlineGameWithLobby(gameMode, matchedPlayers);
  }
}

function startOnlineGameWithLobby(gameMode, matchedPlayers) {
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const players = {};
  const teamSize = matchedPlayers.length / 2;

  const getSpawnPosition = (team) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 600 + Math.random() * 300;
    const side = team === "green" ? -1 : 1;
    return {
      x: Math.cos(angle) * radius * side * 1.2,
      y: Math.sin(angle) * radius,
    };
  };

  // Lobby players go on green, others fill remaining green then red
  const lobbyPlayers = matchedPlayers.filter((e) => e.lobbyId);
  const soloPlayers = matchedPlayers.filter((e) => !e.lobbyId);

  let greenCount = 0;

  // Lobby players always on green
  lobbyPlayers.forEach((entry) => {
    const pos = getSpawnPosition("green");
    players[entry.socket.id] = {
      id: entry.socket.id,
      username: entry.playerData.username || "Player",
      x: pos.x,
      y: pos.y,
      segments: [{ x: pos.x, y: pos.y }],
      direction: { x: 1, y: 0 },
      score: 0,
      color: "#00e701",
      alive: true,
      betAmount: entry.playerData.betAmount || 0,
      isBot: false,
      team: "green",
    };
    greenCount++;
  });

  // Solo players fill green first, then red
  soloPlayers.forEach((entry) => {
    const team = greenCount < teamSize ? "green" : "red";
    const pos = getSpawnPosition(team);
    players[entry.socket.id] = {
      id: entry.socket.id,
      username: entry.playerData.username || "Player",
      x: pos.x,
      y: pos.y,
      segments: [{ x: pos.x, y: pos.y }],
      direction: { x: team === "green" ? 1 : -1, y: 0 },
      score: 0,
      color: team === "green" ? "#00e701" : "#ff4444",
      alive: true,
      betAmount: entry.playerData.betAmount || 0,
      isBot: false,
      team,
    };
    if (team === "green") greenCount++;
  });

  const foodCount = gameMode === "1v1" ? 100 : gameMode === "2v2" ? 120 : 150;
  const gameState = {
    id: gameId,
    players,
    food: generateFood(foodCount),
    startTime: Date.now(),
    botDifficulty: "medium",
    botPositionHistory: {},
  };

  activeGames.set(gameId, gameState);

  matchedPlayers.forEach((entry) => {
    entry.socket.join(gameId);
    entry.socket.emit("match-found", {
      gameId,
      playerId: entry.socket.id,
      gameState: serializeGameState(gameState),
    });
  });

  // Clean up lobby references
  const lobbyIds = new Set(lobbyPlayers.map((p) => p.lobbyId));
  lobbyIds.forEach((lid) => {
    const lobby = gameLobbies.get(lid);
    if (lobby) {
      lobby.players.forEach((p) => userLobbies.delete(p.odrediserId));
      gameLobbies.delete(lid);
    }
  });
}

function leaveLobby(odrediserId, lobbyId) {
  const lobby = gameLobbies.get(lobbyId);
  if (!lobby) return;

  // If in matchmaking, remove ALL lobby members from queue
  if (lobby.status === "matchmaking") {
    const queue = matchmakingQueues.get(lobby.gameType);
    if (queue) {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].lobbyId === lobbyId) {
          queue.splice(i, 1);
        }
      }
      // Notify remaining queue
      const needed = REQUIRED_PLAYERS[lobby.gameType] || 10;
      queue.forEach((p) => {
        p.socket.emit("queue-update", {
          playersInQueue: queue.length,
          playersNeeded: needed,
        });
      });
    }
  }

  const playerIndex = lobby.players.findIndex((p) => p.odrediserId === odrediserId);
  if (playerIndex === -1) return;

  lobby.players.splice(playerIndex, 1);
  userLobbies.delete(odrediserId);

  if (lobby.players.length < 2) {
    lobby.players.forEach((p) => {
      io.to(p.odrediserSocketId).emit("lobby-closed", { lobbyId, reason: "Player left" });
      userLobbies.delete(p.odrediserId);
    });
    gameLobbies.delete(lobbyId);
  } else {
    const lobbyData = {
      lobbyId,
      gameType: lobby.gameType,
      players: lobby.players.map((p) => ({
        odrediserId: p.odrediserId,
        ready: p.ready,
      })),
      hostId: lobby.hostId,
      status: lobby.status,
      fillMode: lobby.fillMode,
      botDifficulty: lobby.botDifficulty,
    };
    lobby.players.forEach((p) => {
      io.to(p.odrediserSocketId).emit("lobby-updated", lobbyData);
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GAME LOOP - 60 FPS
// ════════════════════════════════════════════════════════════════════════════

setInterval(() => {
  activeGames.forEach((game, gameId) => {
    updateGame(game);
    io.to(gameId).emit("game-update", serializeGameState(game));
  });
}, 1000 / 60);

// ════════════════════════════════════════════════════════════════════════════
// GAME LOGIC
// ════════════════════════════════════════════════════════════════════════════

function generateFood(count) {
  const food = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 1400;
    food.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      id: Math.random().toString(36).substr(2, 9),
    });
  }
  return food;
}

function updateGame(game) {
  const playerIds = Object.keys(game.players);
  const difficulty = game.botDifficulty || "medium";
  const now = Date.now();

  // Grace period check
  const inGracePeriod = game.gracePeriodEnd && now < game.gracePeriodEnd;
  const allHumansConnected = !game.expectedHumans || game.connectedHumans >= game.expectedHumans;

  if (inGracePeriod || !allHumansConnected) {
    return;
  }

  // Bot AI constants
  const WORLD_RADIUS = 1500;
  const RETURN_ENTER_THRESHOLD = WORLD_RADIUS * 0.7;
  const RETURN_EXIT_THRESHOLD = WORLD_RADIUS * 0.55;
  const FOOD_MAX_RADIUS = WORLD_RADIUS * 0.6;
  const FOOD_SAFE_RADIUS = WORLD_RADIUS * 0.65;
  const EDGE_REPULSION_START = WORLD_RADIUS * 0.6;

  const difficultySettings = {
    easy: { detectionRange: 250, aggressionThreshold: 8 },
    medium: { detectionRange: 400, aggressionThreshold: 3 },
    hard: { detectionRange: 600, aggressionThreshold: 0 },
  };
  const settings = difficultySettings[difficulty];

  if (!game.botStates) {
    game.botStates = {};
  }

  // THREE-LAYER BOT AI
  const evaluateState = (bot, enemies, distFromCenter) => {
    const currentState = game.botStates[bot.id] || "FORAGE";

    if (currentState === "RETURN_TO_CENTER") {
      if (distFromCenter < RETURN_EXIT_THRESHOLD) {
        // fall through to check other conditions
      } else {
        return "RETURN_TO_CENTER";
      }
    } else if (distFromCenter > RETURN_ENTER_THRESHOLD) {
      return "RETURN_TO_CENTER";
    }

    let nearestThreat = null;
    let nearestPrey = null;
    let minThreatDist = Infinity;
    let minPreyDist = Infinity;

    for (const enemy of enemies) {
      if (!enemy.alive || enemy.team === bot.team) continue;
      const dx = enemy.x - bot.x;
      const dy = enemy.y - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > settings.detectionRange) continue;

      if (enemy.score > bot.score + 2) {
        if (dist < minThreatDist) {
          minThreatDist = dist;
          nearestThreat = enemy;
        }
      } else if (bot.score > enemy.score + settings.aggressionThreshold) {
        if (dist < minPreyDist) {
          minPreyDist = dist;
          nearestPrey = enemy;
        }
      }
    }

    if (nearestThreat && minThreatDist < 200) return "EVADE";
    if (nearestPrey) {
      const preyDistFromCenter = Math.sqrt(nearestPrey.x ** 2 + nearestPrey.y ** 2);
      if (preyDistFromCenter < distFromCenter || distFromCenter < FOOD_MAX_RADIUS) return "PRESSURE";
    }

    return "FORAGE";
  };

  const selectTarget = (bot, state, enemies, food, distFromCenter) => {
    switch (state) {
      case "RETURN_TO_CENTER":
        return { type: "center", x: 0, y: 0 };

      case "EVADE": {
        let nearestThreat = null;
        let minDist = Infinity;
        for (const enemy of enemies) {
          if (!enemy.alive || enemy.team === bot.team) continue;
          if (enemy.score <= bot.score) continue;
          const dist = Math.sqrt((enemy.x - bot.x) ** 2 + (enemy.y - bot.y) ** 2);
          if (dist < minDist) {
            minDist = dist;
            nearestThreat = enemy;
          }
        }
        if (nearestThreat) {
          const escapeX = bot.x - nearestThreat.x;
          const escapeY = bot.y - nearestThreat.y;
          const centerBiasX = -bot.x * 0.3;
          const centerBiasY = -bot.y * 0.3;
          return { type: "evade", x: bot.x + escapeX + centerBiasX, y: bot.y + escapeY + centerBiasY };
        }
        return { type: "center", x: 0, y: 0 };
      }

      case "PRESSURE": {
        let bestPrey = null;
        let minDist = Infinity;
        for (const enemy of enemies) {
          if (!enemy.alive || enemy.team === bot.team) continue;
          if (bot.score <= enemy.score + settings.aggressionThreshold) continue;
          const preyDistFromCenter = Math.sqrt(enemy.x ** 2 + enemy.y ** 2);
          if (distFromCenter > FOOD_MAX_RADIUS && preyDistFromCenter > distFromCenter) continue;
          const dist = Math.sqrt((enemy.x - bot.x) ** 2 + (enemy.y - bot.y) ** 2);
          if (dist < minDist && dist < settings.detectionRange) {
            minDist = dist;
            bestPrey = enemy;
          }
        }
        if (bestPrey) return { type: "enemy", x: bestPrey.x, y: bestPrey.y };
      }
      // falls through to FORAGE if no prey found

      case "FORAGE":
      default: {
        let bestFood = null;
        let bestScore = Infinity;
        for (const f of food) {
          const foodDistFromCenter = Math.sqrt(f.x ** 2 + f.y ** 2);
          if (foodDistFromCenter > FOOD_SAFE_RADIUS) continue;
          const distToFood = Math.sqrt((bot.x - f.x) ** 2 + (bot.y - f.y) ** 2);
          const outerPenalty = (distFromCenter / WORLD_RADIUS) * foodDistFromCenter * 0.8;
          const score = distToFood + outerPenalty;
          if (score < bestScore) {
            bestScore = score;
            bestFood = f;
          }
        }
        if (bestFood) return { type: "food", x: bestFood.x, y: bestFood.y };
        return { type: "center", x: 0, y: 0 };
      }
    }
  };

  const computeSteering = (bot, target, state, enemies, distFromCenter) => {
    let forceX = 0;
    let forceY = 0;

    const toTargetX = target.x - bot.x;
    const toTargetY = target.y - bot.y;
    const targetDist = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);

    if (targetDist > 0) {
      let attractionStrength;
      switch (state) {
        case "RETURN_TO_CENTER": attractionStrength = 2.0; break;
        case "EVADE": attractionStrength = 1.5; break;
        case "PRESSURE": attractionStrength = 1.2; break;
        default: attractionStrength = 1.0;
      }
      forceX += (toTargetX / targetDist) * attractionStrength;
      forceY += (toTargetY / targetDist) * attractionStrength;
    }

    if (state !== "PRESSURE") {
      for (const enemy of enemies) {
        if (!enemy.alive || enemy.team === bot.team) continue;
        if (enemy.score <= bot.score) continue;
        const dx = bot.x - enemy.x;
        const dy = bot.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 300 && dist > 0) {
          const repulsionStrength = (150 / (dist * dist)) * 50;
          forceX += (dx / dist) * repulsionStrength;
          forceY += (dy / dist) * repulsionStrength;
        }
      }
    }

    if (distFromCenter > EDGE_REPULSION_START) {
      const normalizedDist = (distFromCenter - EDGE_REPULSION_START) / (WORLD_RADIUS - EDGE_REPULSION_START);
      const edgeStrength = (Math.exp(3 * normalizedDist) - 1) * 2.5;
      const toCenterX = -bot.x;
      const toCenterY = -bot.y;
      const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
      if (centerDist > 0) {
        forceX += (toCenterX / centerDist) * edgeStrength;
        forceY += (toCenterY / centerDist) * edgeStrength;
      }
    }

    if (distFromCenter > WORLD_RADIUS * 0.85) {
      const cornerStrength = ((distFromCenter - WORLD_RADIUS * 0.85) / (WORLD_RADIUS * 0.15)) * 5;
      const toCenterX = -bot.x;
      const toCenterY = -bot.y;
      const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
      if (centerDist > 0) {
        forceX += (toCenterX / centerDist) * cornerStrength;
        forceY += (toCenterY / centerDist) * cornerStrength;
      }
    }

    const forceMag = Math.sqrt(forceX * forceX + forceY * forceY);
    if (forceMag > 0) return { x: forceX / forceMag, y: forceY / forceMag };
    return { x: bot.direction.x, y: bot.direction.y };
  };

  // Bot AI update
  const allPlayers = Object.values(game.players);
  const enemies = allPlayers.filter((p) => p.alive);

  playerIds.forEach((playerId) => {
    const player = game.players[playerId];
    if (!player.alive || !player.isBot) return;

    const distFromCenter = Math.sqrt(player.x ** 2 + player.y ** 2);
    const state = evaluateState(player, enemies, distFromCenter);
    game.botStates[playerId] = state;

    const target = selectTarget(player, state, enemies, game.food, distFromCenter);
    player.direction = computeSteering(player, target, state, enemies, distFromCenter);
  });

  // Movement and collision
  playerIds.forEach((playerId) => {
    const player = game.players[playerId];
    if (!player.alive) return;

    const speed = 4;
    player.x += player.direction.x * speed;
    player.y += player.direction.y * speed;

    player.segments.unshift({ x: player.x, y: player.y });
    const maxLength = 15 + Math.floor(player.score / 2);
    if (player.segments.length > maxLength) player.segments.pop();

    // Boundary check
    const maxDist = 1500;
    const distFromCenter = Math.sqrt(player.x ** 2 + player.y ** 2);
    if (distFromCenter > maxDist) {
      player.alive = false;
      for (let i = 0; i < 5; i++) {
        game.food.push({
          x: player.x + (Math.random() - 0.5) * 100,
          y: player.y + (Math.random() - 0.5) * 100,
          id: Math.random().toString(36).substr(2, 9),
        });
      }
      return;
    }

    // Collision with enemy segments
    playerIds.forEach((otherPlayerId) => {
      if (otherPlayerId === playerId) return;
      const otherPlayer = game.players[otherPlayerId];
      if (!otherPlayer.alive) return;

      const sameTeam = player.team === otherPlayer.team;
      if (sameTeam) return;

      otherPlayer.segments.forEach((segment, index) => {
        if (index === 0) return;
        const dx = player.x - segment.x;
        const dy = player.y - segment.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 15) {
          player.alive = false;
          otherPlayer.score += 10;
          for (let i = 0; i < 5; i++) {
            game.food.push({
              x: player.x + (Math.random() - 0.5) * 100,
              y: player.y + (Math.random() - 0.5) * 100,
              id: Math.random().toString(36).substr(2, 9),
            });
          }
        }
      });
    });

    // Food collection
    game.food = game.food.filter((food) => {
      const dx = player.x - food.x;
      const dy = player.y - food.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) {
        player.score += 1;
        return false;
      }
      return true;
    });
  });

  // Replenish food
  while (game.food.length < 150) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 1400;
    game.food.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      id: Math.random().toString(36).substr(2, 9),
    });
  }
}

function serializeGameState(game) {
  const now = Date.now();
  const gracePeriodRemaining = game.gracePeriodEnd ? Math.max(0, Math.ceil((game.gracePeriodEnd - now) / 1000)) : 0;
  const pings = game.playerPings || {};

  return {
    id: game.id,
    players: Object.values(game.players).map((p) => ({
      id: p.id,
      username: p.username,
      x: p.x,
      y: p.y,
      segments: p.segments,
      direction: p.direction,
      score: p.score,
      color: p.color,
      alive: p.alive,
      team: p.team,
      isBot: p.isBot,
      ping: pings[p.id] || 0,
    })),
    food: game.food,
    startTime: game.startTime,
    gracePeriodRemaining,
    connectedHumans: game.connectedHumans || 0,
    expectedHumans: game.expectedHumans || 0,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════════════════

httpServer.listen(port, () => {
  console.log(`Socket.IO server running on port ${port}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});
