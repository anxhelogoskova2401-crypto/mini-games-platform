"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";

const MIN_BET = 50;

interface User {
  id?: string;
  email?: string | null;
  username?: string;
}

interface Player {
  id: string;
  username: string;
  x: number;
  y: number;
  segments: { x: number; y: number }[];
  direction: { x: number; y: number };
  score: number;
  color: string;
  alive: boolean;
  team: "green" | "red";
  isBot: boolean;
}

interface GameState {
  id: string;
  players: Player[];
  food: { x: number; y: number; id: string }[];
  startTime: number;
}

export default function SlitherMultiplayerGame({ user }: { user: User }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(1920);
  const [canvasHeight, setCanvasHeight] = useState(1080);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState(MIN_BET);
  const [searching, setSearching] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [playerDead, setPlayerDead] = useState(false);
  const [spectating, setSpectating] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [playerTeam, setPlayerTeam] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<"online" | "offline">("offline");
  const [gameMode, setGameMode] = useState<"1v1" | "2v2" | "5v5">("5v5");
  const [botDifficulty, setBotDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // Menu & Settings
  const [showMenu, setShowMenu] = useState(false);
  const [sensitivity, setSensitivity] = useState(1.0);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [joiningFromLobby, setJoiningFromLobby] = useState(false);
  const [lobbyGameData, setLobbyGameData] = useState<{
    lobbyId: string;
    gameId: string;
    playerId: string;
    gameType: string;
  } | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ playersInQueue: number; playersNeeded: number } | null>(null);

  const router = useRouter();

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      setCanvasWidth(window.innerWidth);
      setCanvasHeight(window.innerHeight);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Check for lobby game data on mount
  useEffect(() => {
    const storedData = sessionStorage.getItem("lobbyGameData");
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setLobbyGameData(data);
        setJoiningFromLobby(true);
        sessionStorage.removeItem("lobbyGameData");
      } catch (e) {
        console.error("Failed to parse lobby game data:", e);
      }
    }
  }, []);

  // ESC key handler for menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gameState && !gameOver) {
        setShowMenu((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, gameOver]);

  useEffect(() => {
    fetchBalance();

    // Connect to Socket.io
    socketRef.current = getSocket();

    socketRef.current.on("connect", () => {
      setSocketConnected(true);
    });

    socketRef.current.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });

    socketRef.current.on("queue-update", (data: { playersInQueue: number; playersNeeded: number }) => {
      setQueueInfo(data);
    });

    socketRef.current.on("matchmaking-cancelled", () => {
      setSearching(false);
      setQueueInfo(null);
    });

    socketRef.current.on("match-found", (data) => {
      playerIdRef.current = data.playerId;
      gameStateRef.current = data.gameState;
      setPlayerId(data.playerId);
      setGameState(data.gameState);
      setSearching(false);
      setQueueInfo(null);
      setPlayerDead(false);
      setSpectating(false);
      // Set player's team for correct win/lose display
      const myPlayer = data.gameState.players.find((p: { id: string; team: string }) => p.id === data.playerId);
      if (myPlayer) {
        setPlayerTeam(myPlayer.team === "green" ? "Green Team" : "Red Team");
      }
    });

    socketRef.current.on("game-update", (updatedGameState: GameState) => {
      gameStateRef.current = updatedGameState;
      setGameState(updatedGameState);

      // Check if player died
      const player = updatedGameState.players.find((p) => p.id === playerIdRef.current);
      if (player && !player.alive && !playerDead && !gameOver) {
        setPlayerDead(true);
      }

      // Check if game is over - team based
      const greenTeam = updatedGameState.players.filter((p) => p.team === "green" && p.alive);
      const redTeam = updatedGameState.players.filter((p) => p.team === "red" && p.alive);

      if (greenTeam.length === 0 && redTeam.length > 0) {
        setWinner("Red Team");
        setGameOver(true);
        // Check if player won (red team player)
        const playerData = updatedGameState.players.find((p) => p.id === playerIdRef.current);
        if (playerData && playerData.team === "red") {
          handleWin();
        }
      } else if (redTeam.length === 0 && greenTeam.length > 0) {
        setWinner("Green Team");
        setGameOver(true);
        // Check if player won (green team player)
        const playerData = updatedGameState.players.find((p) => p.id === playerIdRef.current);
        if (playerData && playerData.team === "green") {
          handleWin();
        }
      }
    });

    socketRef.current.on("player-disconnected", () => {
    });

    // Handle joining lobby game
    socketRef.current.on("lobby-game-joined", (data: { gameId: string; playerId: string; gameState: GameState }) => {
      playerIdRef.current = data.playerId;
      gameStateRef.current = data.gameState;
      setPlayerId(data.playerId);
      setGameState(data.gameState);
      setJoiningFromLobby(false);
      setPlayerDead(false);
      setSpectating(false);
      // Set player's team for correct win/lose display
      const myPlayer = data.gameState.players.find(p => p.id === data.playerId);
      if (myPlayer) {
        setPlayerTeam(myPlayer.team === "green" ? "Green Team" : "Red Team");
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("connect");
        socketRef.current.off("connect_error");
        socketRef.current.off("queue-update");
        socketRef.current.off("matchmaking-cancelled");
        socketRef.current.off("match-found");
        socketRef.current.off("game-update");
        socketRef.current.off("player-disconnected");
        socketRef.current.off("lobby-game-joined");
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Join lobby game when we have lobby data and socket is connected
  useEffect(() => {
    if (lobbyGameData && socketConnected && socketRef.current) {
      socketRef.current.emit("join-lobby-game", {
        gameId: lobbyGameData.gameId,
        odrediserId: user.id,
      });

      // Also listen for errors
      socketRef.current.on("error", (err) => {
        console.error("Socket error:", err);
        setJoiningFromLobby(false);
      });
    }
  }, [lobbyGameData, socketConnected, user.id]);

  // Attach mousemove listener
  useEffect(() => {
    const handleMouseMoveGlobal = (e: MouseEvent) => {
      if (!showMenu && !playerDead) {
        handleMouseMove(e);
      }
    };

    document.addEventListener("mousemove", handleMouseMoveGlobal);
    return () => document.removeEventListener("mousemove", handleMouseMoveGlobal);
  }, [sensitivity, playerDead, showMenu]);

  useEffect(() => {
    if (gameState && !gameOver) {
      let lastFrameTime = 0;
      const targetFPS = 60;
      const frameDelay = 1000 / targetFPS;

      const animate = (currentTime: number) => {
        const deltaTime = currentTime - lastFrameTime;

        if (deltaTime >= frameDelay) {
          renderGame();
          lastFrameTime = currentTime - (deltaTime % frameDelay);
        }

        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animate(0);
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [gameState, gameOver, canvasWidth, canvasHeight, showMinimap, showLeaderboard, spectating, playerDead]);

  const fetchBalance = async () => {
    try {
      const response = await fetch("/api/coins/balance");
      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance);
      } else if (response.status === 401) {
        router.push("/login");
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  };

  const startMatchmaking = async () => {
    // Online mode requires betting
    if (playMode === "online") {
      if (balance === null || balance < betAmount) {
        alert("Insufficient balance!");
        return;
      }

      try {
        const response = await fetch("/api/coins/spend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: betAmount,
            description: `Slither Battle ${gameMode} entry fee`,
            gameId: `slither-${gameMode}`,
          }),
        });

        if (!response.ok) {
          alert("Failed to place bet");
          return;
        }

        const data = await response.json();
        setBalance(data.balance);
      } catch (error) {
        alert("Error placing bet");
        return;
      }
    }

    // Start game (both online and offline)
    setSearching(true);
    socketRef.current?.emit("find-match", {
      username: user.username || user.email?.split("@")[0] || "Player",
      betAmount: playMode === "online" ? betAmount : 0,
      gameMode,
      botDifficulty,
      playMode,
    });
  };

  const handleWin = async () => {
    // Only award coins in online mode
    if (playMode === "offline") return;

    const winAmount = betAmount * 2;
    try {
      await fetch("/api/coins/earn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: winAmount,
          description: `Slither Battle ${gameMode} victory`,
          gameId: `slither-${gameMode}`,
        }),
      });
      fetchBalance();
    } catch (error) {
      console.error("Error claiming reward:", error);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const currentGameState = gameStateRef.current;
    const currentPlayerId = playerIdRef.current;

    if (!socketRef.current || !currentGameState || !currentPlayerId || showMenu) return;

    const player = currentGameState.players.find((p) => p.id === currentPlayerId);
    if (!player || !player.alive) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    mousePosRef.current = {
      x: (e.clientX - rect.left - rect.width / 2) * sensitivity,
      y: (e.clientY - rect.top - rect.height / 2) * sensitivity,
    };

    const dx = mousePosRef.current.x;
    const dy = mousePosRef.current.y;
    const magnitude = Math.sqrt(dx * dx + dy * dy);

    if (magnitude > 10) {
      const direction = {
        x: dx / magnitude,
        y: dy / magnitude,
      };
      socketRef.current.emit("update-direction", {
        gameId: currentGameState.id,
        direction,
      });
    }
  };

  const startSpectating = () => {
    setPlayerDead(false);
    setSpectating(true);
  };

  const exitToMenu = () => {
    window.location.reload();
  };

  const resumeGame = () => {
    setShowMenu(false);
  };

  const quitToDashboard = () => {
    router.push("/dashboard");
  };

  const startSpectatingFromMenu = () => {
    setShowMenu(false);
    setSpectating(true);
  };

  const renderGame = () => {
    const canvas = canvasRef.current;
    const currentGameState = gameStateRef.current;
    const currentPlayerId = playerIdRef.current;

    if (!canvas || !currentGameState || !currentPlayerId) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Determine camera target (player or spectate mode)
    let cameraTarget = currentGameState.players.find((p) => p.id === currentPlayerId);
    if (spectating || !cameraTarget || !cameraTarget.alive) {
      // Follow a random alive player for spectating
      const alivePlayers = currentGameState.players.filter((p) => p.alive);
      if (alivePlayers.length > 0) {
        cameraTarget = alivePlayers[0];
      } else if (cameraTarget) {
        // Keep using dead player position
      } else {
        return;
      }
    }

    // Clear canvas
    ctx.fillStyle = "#0f212e";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.save();

    // Center camera on target
    ctx.translate(
      canvasWidth / 2 - cameraTarget.x,
      canvasHeight / 2 - cameraTarget.y
    );

    // Draw grid (optimized - only visible area)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gridSize = 100;
    const startX = Math.floor((-cameraTarget.x + canvasWidth / 2 - canvasWidth) / gridSize) * gridSize;
    const endX = Math.ceil((-cameraTarget.x + canvasWidth / 2 + canvasWidth) / gridSize) * gridSize;
    const startY = Math.floor((-cameraTarget.y + canvasHeight / 2 - canvasHeight) / gridSize) * gridSize;
    const endY = Math.ceil((-cameraTarget.y + canvasHeight / 2 + canvasHeight) / gridSize) * gridSize;

    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Draw boundary circle
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 1500, 0, Math.PI * 2);
    ctx.stroke();

    // Draw food (optimized - batch operations)
    ctx.fillStyle = "#FFA500";
    currentGameState.food.forEach((food) => {
      ctx.beginPath();
      ctx.arc(food.x, food.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw players
    currentGameState.players.forEach((p) => {
      if (!p.alive || !p.segments || p.segments.length === 0) return;

      // Draw segments (optimized - reduce calculations)
      const segmentCount = p.segments.length;
      const segmentCountInv = 1 / segmentCount;
      ctx.fillStyle = p.color;

      p.segments.forEach((segment, index) => {
        ctx.globalAlpha = (1 - index * segmentCountInv) * 0.7 + 0.3;
        const size = 15 * (1 - index * segmentCountInv * 0.3);
        ctx.beginPath();
        ctx.arc(segment.x, segment.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;

      // Draw head
      ctx.fillStyle = p.color;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw username
      ctx.fillStyle = "white";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.fillText(p.username, p.x, p.y - 25);
    });

    ctx.restore();

    // Draw team scores HUD
    const greenTeam = currentGameState.players.filter((p) => p.team === "green");
    const redTeam = currentGameState.players.filter((p) => p.team === "red");
    const greenAlive = greenTeam.filter((p) => p.alive).length;
    const redAlive = redTeam.filter((p) => p.alive).length;
    const greenScore = greenTeam.reduce((sum, p) => sum + p.score, 0);
    const redScore = redTeam.reduce((sum, p) => sum + p.score, 0);

    // Draw team scores at top
    const greenTotal = greenTeam.length;
    const redTotal = redTeam.length;

    ctx.fillStyle = "#00e701";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Green: ${greenScore} (${greenAlive}/${greenTotal})`, 20, 50);

    ctx.fillStyle = "#ff4444";
    ctx.textAlign = "right";
    ctx.fillText(`Red: ${redScore} (${redAlive}/${redTotal})`, canvasWidth - 20, 50);

    // Draw elapsed time
    const elapsed = Math.floor((Date.now() - currentGameState.startTime) / 1000);
    ctx.fillStyle = "white";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`, canvasWidth / 2, 50);

    // Draw leaderboard
    if (showLeaderboard) {
      const leaderboardWidth = 250;
      const leaderboardX = 20;
      const leaderboardY = 80;

      const sortedPlayers = [...currentGameState.players]
        .filter((p) => p.alive)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(leaderboardX, leaderboardY, leaderboardWidth, 40 + sortedPlayers.length * 30);

      ctx.fillStyle = "white";
      ctx.font = "bold 18px Arial";
      ctx.textAlign = "left";
      ctx.fillText("Leaderboard", leaderboardX + 10, leaderboardY + 25);

      sortedPlayers.forEach((p, index) => {
        const y = leaderboardY + 50 + index * 30;
        const isCurrentPlayer = p.id === currentPlayerId;

        ctx.fillStyle = isCurrentPlayer ? "#FFD700" : p.color;
        ctx.font = isCurrentPlayer ? "bold 16px Arial" : "14px Arial";
        ctx.fillText(`${index + 1}. ${p.username}`, leaderboardX + 10, y);

        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(`${p.score}`, leaderboardX + leaderboardWidth - 10, y);
        ctx.textAlign = "left";
      });
    }

    // Draw minimap
    if (showMinimap) {
      const minimapSize = 200;
      const minimapX = canvasWidth - minimapSize - 20;
      const minimapY = canvasHeight - minimapSize - 20;
      const scale = minimapSize / 3000;

      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);

      ctx.strokeStyle = "#ff4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);

      // Draw boundary on minimap
      ctx.strokeStyle = "#ff4444";
      ctx.beginPath();
      ctx.arc(
        minimapX + minimapSize / 2,
        minimapY + minimapSize / 2,
        1500 * scale,
        0,
        Math.PI * 2
      );
      ctx.stroke();

      // Draw players on minimap
      currentGameState.players.forEach((p) => {
        if (!p.alive) return;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(
          minimapX + minimapSize / 2 + p.x * scale,
          minimapY + minimapSize / 2 + p.y * scale,
          4,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
    }

    // Draw spectating indicator
    if (spectating) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(canvasWidth / 2 - 150, 10, 300, 40);
      ctx.fillStyle = "white";
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "center";
      ctx.fillText("👁️ SPECTATING", canvasWidth / 2, 35);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f212e] flex items-center justify-center p-4">
      <style jsx global>{`
        .game-cursor {
          cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2" fill="%2300e701"/><circle cx="12" cy="12" r="8" fill="none" stroke="%2300e701" stroke-width="2"/><line x1="12" y1="0" x2="12" y2="6" stroke="%2300e701" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="24" stroke="%2300e701" stroke-width="2"/><line x1="0" y1="12" x2="6" y2="12" stroke="%2300e701" stroke-width="2"/><line x1="18" y1="12" x2="24" y2="12" stroke="%2300e701" stroke-width="2"/></svg>') 12 12, crosshair;
        }
      `}</style>

      <div className="text-center">
        {!gameState && !searching && !gameOver && !joiningFromLobby && (
          <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md">
            <h1 className="text-4xl font-bold text-white mb-4">
              🐍 Slither Battle
            </h1>
            <p className="text-gray-300 mb-6">
              {gameMode === "1v1" && "1v1 battle! You vs 1 enemy bot. (1 bot total)"}
              {gameMode === "2v2" && "2v2 battle! You + 1 teammate bot vs 2 enemy bots. (3 bots total)"}
              {gameMode === "5v5" && "5v5 battle! You + 4 teammate bots vs 5 enemy bots. (9 bots total)"}
            </p>

            {/* Play Mode Selector */}
            <div className="mb-6">
              <label className="block text-gray-400 mb-2 text-sm">Select Play Mode:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPlayMode("offline")}
                  className={`py-3 px-4 rounded-lg font-bold transition-all ${
                    playMode === "offline"
                      ? "bg-[#00e701] text-black"
                      : "bg-[#0f212e] text-gray-400 hover:bg-[#213743]"
                  }`}
                >
                  <div>Offline</div>
                  <div className="text-xs font-normal mt-1">Practice Mode</div>
                </button>
                <button
                  onClick={() => setPlayMode("online")}
                  className={`py-3 px-4 rounded-lg font-bold transition-all ${
                    playMode === "online"
                      ? "bg-[#00e701] text-black"
                      : "bg-[#0f212e] text-gray-400 hover:bg-[#213743]"
                  }`}
                >
                  <div>Online</div>
                  <div className="text-xs font-normal mt-1">Bet Coins</div>
                </button>
              </div>
            </div>

            {/* Game Mode Selector */}
            <div className="mb-6">
              <label className="block text-gray-400 mb-2 text-sm">Select Game Mode:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setGameMode("1v1")}
                  className={`py-3 px-4 rounded-lg font-bold transition-all ${
                    gameMode === "1v1"
                      ? "bg-[#00e701] text-black"
                      : "bg-[#0f212e] text-gray-400 hover:bg-[#213743]"
                  }`}
                >
                  1v1
                </button>
                <button
                  onClick={() => setGameMode("2v2")}
                  className={`py-3 px-4 rounded-lg font-bold transition-all ${
                    gameMode === "2v2"
                      ? "bg-[#00e701] text-black"
                      : "bg-[#0f212e] text-gray-400 hover:bg-[#213743]"
                  }`}
                >
                  2v2
                </button>
                <button
                  onClick={() => setGameMode("5v5")}
                  className={`py-3 px-4 rounded-lg font-bold transition-all ${
                    gameMode === "5v5"
                      ? "bg-[#00e701] text-black"
                      : "bg-[#0f212e] text-gray-400 hover:bg-[#213743]"
                  }`}
                >
                  5v5
                </button>
              </div>
            </div>

            {/* Bot Difficulty Selector (offline only) */}
            {playMode === "offline" && (
              <div className="mb-6">
                <label className="block text-gray-400 mb-2 text-sm">Bot Difficulty:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setBotDifficulty("easy")}
                    className={`py-3 px-4 rounded-lg font-bold transition-all ${
                      botDifficulty === "easy"
                        ? "bg-[#00e701] text-black"
                        : "bg-[#0f212e] text-gray-400 hover:bg-[#213743]"
                    }`}
                  >
                    Easy
                  </button>
                  <button
                    onClick={() => setBotDifficulty("medium")}
                    className={`py-3 px-4 rounded-lg font-bold transition-all ${
                      botDifficulty === "medium"
                        ? "bg-[#00e701] text-black"
                        : "bg-[#0f212e] text-gray-400 hover:bg-[#213743]"
                    }`}
                  >
                    Medium
                  </button>
                  <button
                    onClick={() => setBotDifficulty("hard")}
                    className={`py-3 px-4 rounded-lg font-bold transition-all ${
                      botDifficulty === "hard"
                        ? "bg-[#00e701] text-black"
                        : "bg-[#0f212e] text-gray-400 hover:bg-[#213743]"
                    }`}
                  >
                    Hard
                  </button>
                </div>
              </div>
            )}

            {playMode === "online" && (
              <div className="bg-[#0f212e] p-4 rounded-lg mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-400">Your Balance:</span>
                  <span className="text-yellow-400 font-bold">
                    {balance === null
                      ? "Loading..."
                      : `${balance.toLocaleString()} coins`}
                  </span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-400">Entry Fee:</span>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(Number(e.target.value))}
                    min={MIN_BET}
                    className="bg-[#213743] text-white px-3 py-1 rounded w-32 text-right"
                  />
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Winner takes all! Minimum bet: {MIN_BET} coins
                </div>
              </div>
            )}

            {playMode === "offline" && (
              <div className="bg-[#0f212e] p-4 rounded-lg mb-6 border-2 border-blue-500">
                <p className="text-blue-400 font-bold text-center">
                  🎮 Practice Mode - No coins required!
                </p>
              </div>
            )}

            <button
              onClick={startMatchmaking}
              disabled={playMode === "online" && (balance === null || balance < betAmount)}
              className="w-full bg-[#00e701] text-black font-bold py-3 px-6 rounded-lg hover:bg-[#00ff00] transition disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {playMode === "offline"
                ? "Start Practice"
                : balance === null
                ? "Loading..."
                : balance < betAmount
                ? "Insufficient Balance"
                : "Find Match"}
            </button>

            <a
              href="/dashboard"
              className="block mt-4 text-blue-400 hover:text-blue-300"
            >
              ← Back to Dashboard
            </a>
          </div>
        )}

        {searching && (
          <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md text-center">
            <div className="animate-pulse text-4xl mb-4">
              {playMode === "offline" ? "🎮" : "⚔️"}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {playMode === "offline" ? "Starting Practice..." : "Searching for Players..."}
            </h2>
            {playMode === "online" && queueInfo ? (
              <>
                <p className="text-gray-400 mb-1">
                  {queueInfo.playersInQueue} / {queueInfo.playersNeeded} players found
                </p>
                <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
                  <div
                    className="bg-yellow-500 h-3 rounded-full transition-all"
                    style={{ width: `${(queueInfo.playersInQueue / queueInfo.playersNeeded) * 100}%` }}
                  />
                </div>
                <button
                  onClick={() => {
                    socketRef.current?.emit("cancel-matchmaking");
                    setSearching(false);
                    setQueueInfo(null);
                  }}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-all"
                >
                  Cancel
                </button>
              </>
            ) : (
              <p className="text-gray-400">Creating {gameMode} match with bots!</p>
            )}
          </div>
        )}

        {joiningFromLobby && !gameState && (
          <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md">
            <div className="animate-pulse text-4xl mb-4">🎮</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Joining Game...
            </h2>
            <p className="text-gray-400">Connecting to your friend match!</p>
          </div>
        )}

        {gameState && !gameOver && (
          <div className="fixed inset-0 z-50">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="w-full h-full game-cursor"
            />

            {/* Death UI */}
            {playerDead && !spectating && (
              <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none">
                <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md w-full pointer-events-auto border-2 border-red-500">
                  <h2 className="text-3xl font-bold text-red-500 mb-6 text-center">💀 You Died!</h2>

                  <div className="bg-[#0f212e] p-4 rounded-lg mb-6">
                    <div className="text-white mb-2">
                      <span className="text-gray-400">Your Score: </span>
                      <span className="text-yellow-400 font-bold text-xl">
                        {gameState.players.find((p) => p.id === playerId)?.score || 0}
                      </span>
                    </div>
                    <div className="text-gray-400 text-sm">
                      The battle continues...
                    </div>
                  </div>

                  <button
                    onClick={startSpectating}
                    className="w-full bg-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition mb-3"
                  >
                    👁️ Spectate Match
                  </button>

                  <button
                    onClick={exitToMenu}
                    className="w-full bg-gray-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-700 transition"
                  >
                    Exit to Menu
                  </button>
                </div>
              </div>
            )}

            {/* In-Game Menu */}
            {showMenu && !playerDead && (
              <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none bg-black bg-opacity-30">
                <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md w-full pointer-events-auto border-2 border-[#00e701]">
                  <h2 className="text-3xl font-bold text-white mb-6 text-center">⚙️ Menu</h2>

                  <button
                    onClick={resumeGame}
                    className="w-full bg-[#00e701] text-black font-bold py-3 px-6 rounded-lg hover:bg-[#00ff00] transition mb-3"
                  >
                    Resume
                  </button>

                  <button
                    onClick={quitToDashboard}
                    className="w-full bg-red-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-red-600 transition"
                  >
                    Exit
                  </button>

                  <div className="text-center mt-4 text-gray-400 text-sm">
                    Press ESC to close
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {gameOver && (
          <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md z-50 relative">
            <h2 className="text-3xl font-bold text-white mb-4">
              {winner === playerTeam
                ? "🎉 Victory!"
                : "💀 Defeat"}
            </h2>
            <div className="bg-[#0f212e] p-6 rounded-lg mb-6">
              <div className="text-2xl font-bold text-yellow-400 mb-2">
                {winner} Wins!
              </div>
              {playMode === "online" ? (
                winner === playerTeam ? (
                  <div className="text-green-400 mt-4 font-bold text-xl">
                    +{betAmount * 2} coins earned!
                  </div>
                ) : (
                  <div className="text-red-400 mt-4">
                    Better luck next time!
                  </div>
                )
              ) : (
                <div className="text-blue-400 mt-4">
                  Practice mode - No coins earned
                </div>
              )}
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full bg-[#00e701] text-black font-bold py-3 px-6 rounded-lg hover:bg-[#00ff00] transition mb-3"
            >
              Play Again
            </button>

            <a
              href="/dashboard"
              className="block text-blue-400 hover:text-blue-300"
            >
              ← Back to Dashboard
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
