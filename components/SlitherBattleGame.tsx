"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MIN_BET = 50;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const WORLD_SIZE = 3000;
const INITIAL_CIRCLE_RADIUS = 1400;
const SHRINK_DELAY = 20000; // Start shrinking after 20 seconds
const SHRINK_RATE = 1; // pixels per frame

type Vector = { x: number; y: number };
type Segment = Vector;
type Food = Vector & { id: number };

interface User {
  id?: string;
  email?: string | null;
  username?: string;
}

interface SlitherBattleGameProps {
  user: User;
}

export default function SlitherBattleGame({ user }: SlitherBattleGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState(MIN_BET);
  const [score, setScore] = useState(0);
  const [survived, setSurvived] = useState(0);
  const router = useRouter();

  // Game state refs
  const playerRef = useRef({
    x: 0,
    y: 0,
    segments: [] as Segment[],
    direction: { x: 1, y: 0 },
    speed: 3,
    size: 15,
    color: "#00e701",
  });

  const gameStateRef = useRef({
    food: [] as Food[],
    circleRadius: INITIAL_CIRCLE_RADIUS,
    gameStartTime: 0,
    mousePos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    camera: { x: 0, y: 0 },
  });

  useEffect(() => {
    fetchBalance();
  }, []);

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

  const startGame = async () => {
    if (balance === null || balance < betAmount) {
      alert("Insufficient balance!");
      return;
    }

    // Deduct bet
    try {
      const response = await fetch("/api/coins/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: betAmount,
          description: "Slither Battle entry fee",
          gameId: "slither-battle",
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

    // Initialize game
    playerRef.current = {
      x: 0,
      y: 0,
      segments: [{ x: 0, y: 0 }],
      direction: { x: 1, y: 0 },
      speed: 3,
      size: 15,
      color: "#00e701",
    };

    gameStateRef.current = {
      food: generateFood(200),
      circleRadius: INITIAL_CIRCLE_RADIUS,
      gameStartTime: Date.now(),
      mousePos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      camera: { x: 0, y: 0 },
    };

    setScore(0);
    setSurvived(0);
    setGameStarted(true);
    setGameOver(false);

    // Start game loop
    requestAnimationFrame(gameLoop);
  };

  const generateFood = (count: number): Food[] => {
    const food: Food[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * INITIAL_CIRCLE_RADIUS * 0.9;
      food.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        id: i,
      });
    }
    return food;
  };

  const gameLoop = () => {
    if (!canvasRef.current || !gameStarted) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const player = playerRef.current;
    const game = gameStateRef.current;

    // Update shrinking circle
    const elapsed = Date.now() - game.gameStartTime;
    if (elapsed > SHRINK_DELAY) {
      game.circleRadius = Math.max(
        300,
        INITIAL_CIRCLE_RADIUS - ((elapsed - SHRINK_DELAY) / 1000) * SHRINK_RATE * 60
      );
    }

    // Update player direction based on mouse
    const dx = game.mousePos.x - CANVAS_WIDTH / 2;
    const dy = game.mousePos.y - CANVAS_HEIGHT / 2;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude > 10) {
      player.direction = {
        x: dx / magnitude,
        y: dy / magnitude,
      };
    }

    // Move player
    player.x += player.direction.x * player.speed;
    player.y += player.direction.y * player.speed;

    // Add new segment
    player.segments.unshift({ x: player.x, y: player.y });
    const maxLength = Math.max(10, Math.floor(score / 2) + 10);
    if (player.segments.length > maxLength) {
      player.segments.pop();
    }

    // Update camera
    game.camera.x = player.x - CANVAS_WIDTH / 2;
    game.camera.y = player.y - CANVAS_HEIGHT / 2;

    // Check if player is outside circle
    const distFromCenter = Math.sqrt(player.x * player.x + player.y * player.y);
    if (distFromCenter > game.circleRadius) {
      endGame(false);
      return;
    }

    // Check food collision
    game.food = game.food.filter((food) => {
      const dx = player.x - food.x;
      const dy = player.y - food.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < player.size + 8) {
        setScore((s) => s + 1);
        return false;
      }
      return true;
    });

    // Replenish food
    while (game.food.length < 200) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * (game.circleRadius - 50);
      game.food.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        id: Date.now() + Math.random(),
      });
    }

    // Update survived time
    setSurvived(Math.floor(elapsed / 1000));

    // Render
    render(ctx);

    requestAnimationFrame(gameLoop);
  };

  const render = (ctx: CanvasRenderingContext2D) => {
    const player = playerRef.current;
    const game = gameStateRef.current;

    // Clear canvas
    ctx.fillStyle = "#0f212e";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    ctx.translate(-game.camera.x, -game.camera.y);

    // Draw shrinking circle
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, game.circleRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw danger zone (outside circle)
    ctx.fillStyle = "rgba(255, 50, 50, 0.1)";
    ctx.beginPath();
    ctx.arc(0, 0, WORLD_SIZE, 0, Math.PI * 2);
    ctx.arc(0, 0, game.circleRadius, 0, Math.PI * 2, true);
    ctx.fill();

    // Draw food
    game.food.forEach((food) => {
      ctx.fillStyle = "#FFA500";
      ctx.beginPath();
      ctx.arc(food.x, food.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw player snake
    player.segments.forEach((segment, index) => {
      const alpha = 1 - index / player.segments.length;
      ctx.fillStyle = player.color;
      ctx.globalAlpha = alpha * 0.8 + 0.2;
      ctx.beginPath();
      const size = player.size * (1 - index / player.segments.length * 0.3);
      ctx.arc(segment.x, segment.y, size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;

    // Draw player head
    ctx.fillStyle = player.color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Draw HUD
    ctx.fillStyle = "white";
    ctx.font = "bold 20px Arial";
    ctx.fillText(`Score: ${score}`, 20, 40);
    ctx.fillText(`Survived: ${survived}s`, 20, 70);
    ctx.fillText(
      `Circle: ${Math.round(game.circleRadius)}m`,
      20,
      100
    );

    // Draw minimap
    const minimapSize = 150;
    const minimapX = CANVAS_WIDTH - minimapSize - 20;
    const minimapY = 20;

    ctx.fillStyle = "rgba(15, 33, 46, 0.8)";
    ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);

    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      minimapX + minimapSize / 2,
      minimapY + minimapSize / 2,
      (game.circleRadius / WORLD_SIZE) * minimapSize * 0.45,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    ctx.fillStyle = player.color;
    ctx.beginPath();
    const playerMinimapX =
      minimapX + minimapSize / 2 + (player.x / WORLD_SIZE) * minimapSize * 0.45;
    const playerMinimapY =
      minimapY + minimapSize / 2 + (player.y / WORLD_SIZE) * minimapSize * 0.45;
    ctx.arc(playerMinimapX, playerMinimapY, 3, 0, Math.PI * 2);
    ctx.fill();
  };

  const endGame = async (won: boolean) => {
    setGameStarted(false);
    setGameOver(true);

    if (won || score > 10) {
      // Calculate winnings based on score and survival time
      const winAmount = Math.floor(betAmount + score * 2 + survived * 0.5);

      try {
        await fetch("/api/coins/earn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: winAmount,
            description: `Slither Battle reward (Score: ${score})`,
            gameId: "slither-battle",
          }),
        });

        fetchBalance();
      } catch (error) {
        console.error("Error claiming reward:", error);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      gameStateRef.current.mousePos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  return (
    <div className="min-h-screen bg-[#0f212e] flex items-center justify-center p-4">
      <div className="text-center">
        {!gameStarted && !gameOver && (
          <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md">
            <h1 className="text-4xl font-bold text-white mb-4">
              🐍 Slither Battle Royale
            </h1>
            <p className="text-gray-300 mb-6">
              Survive the shrinking circle! Eat food to grow. Last one standing wins!
            </p>

            <div className="bg-[#0f212e] p-4 rounded-lg mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-gray-400">Your Balance:</span>
                <span className="text-yellow-400 font-bold">
                  {balance === null ? "Loading..." : `${balance.toLocaleString()} coins`}
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
                Minimum bet: {MIN_BET} coins
              </div>
            </div>

            <button
              onClick={startGame}
              disabled={balance === null || balance < betAmount}
              className="w-full bg-[#00e701] text-black font-bold py-3 px-6 rounded-lg hover:bg-[#00ff00] transition disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {balance === null
                ? "Loading..."
                : balance < betAmount
                ? "Insufficient Balance"
                : "Start Game"}
            </button>

            <a
              href="/dashboard"
              className="block mt-4 text-blue-400 hover:text-blue-300"
            >
              ← Back to Dashboard
            </a>
          </div>
        )}

        {gameStarted && (
          <div>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onMouseMove={handleMouseMove}
              className="border-4 border-[#2f4553] rounded-lg cursor-none"
            />
            <p className="text-white mt-4">Move your mouse to control the snake!</p>
          </div>
        )}

        {gameOver && (
          <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md">
            <h2 className="text-3xl font-bold text-white mb-4">Game Over!</h2>
            <div className="bg-[#0f212e] p-6 rounded-lg mb-6">
              <div className="text-2xl font-bold text-yellow-400 mb-2">
                Score: {score}
              </div>
              <div className="text-xl text-gray-300">
                Survived: {survived} seconds
              </div>
              {score > 10 && (
                <div className="text-green-400 mt-4 font-bold">
                  +{Math.floor(betAmount + score * 2 + survived * 0.5)} coins earned!
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
