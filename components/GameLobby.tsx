"use client";

interface LobbyPlayer {
  odrediserId: string;
  ready: boolean;
}

interface LobbyData {
  lobbyId: string;
  gameType: string;
  players: LobbyPlayer[];
  hostId: string;
  status: string;
  fillMode?: "bots" | "players";
  botDifficulty?: "easy" | "medium" | "hard";
}

interface GameLobbyProps {
  lobby: LobbyData;
  odrediserId: string;
  onReady: () => void;
  onLeave: () => void;
  countdown: number | null;
  isHost: boolean;
  onSetFillMode: (mode: "bots" | "players") => void;
  onSetBotDifficulty: (difficulty: "easy" | "medium" | "hard") => void;
}

const TEAM_SIZES: Record<string, number> = { "1v1": 1, "2v2": 2, "5v5": 5 };

export default function GameLobby({ lobby, odrediserId, onReady, onLeave, countdown, isHost, onSetFillMode, onSetBotDifficulty }: GameLobbyProps) {
  const currentPlayer = lobby.players.find(p => p.odrediserId === odrediserId);
  const isReady = currentPlayer?.ready || false;
  const fillMode = lobby.fillMode || "bots";
  const botDifficulty = lobby.botDifficulty || "medium";
  const teamSize = TEAM_SIZES[lobby.gameType] || 1;
  const isTeamMode = lobby.gameType !== "1v1";

  // Calculate bot/waiting slots
  const greenHumans = isTeamMode ? lobby.players.length : 1;
  const greenSlotsNeeded = isTeamMode ? teamSize - greenHumans : 0;
  const redSlotsNeeded = isTeamMode ? teamSize : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
      <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md w-full mx-4 border-2 border-[#00e701]">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-black text-white mb-2">
            {lobby.gameType} Game Lobby
          </h2>
          <p className="text-gray-400">
            {lobby.status === "matchmaking"
              ? "Searching for online players..."
              : countdown !== null
                ? `Starting in ${countdown}...`
                : "Waiting for players to ready up"}
          </p>
        </div>

        {/* Green Team */}
        <div className="space-y-3 mb-4">
          {isTeamMode && (
            <p className="text-sm font-bold text-[#00e701] uppercase tracking-wide">Green Team</p>
          )}

          {/* Human players */}
          {lobby.players.map((player, index) => {
            const team = isTeamMode ? "green" : (index === 0 ? "green" : "red");
            return (
              <div
                key={player.odrediserId}
                className={`p-4 rounded-lg flex items-center justify-between ${
                  player.ready ? "bg-green-900/30 border-green-500" : "bg-[#0f212e]"
                } border-2 ${player.ready ? "border-green-500" : "border-gray-700"}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${
                    team === "green" ? "bg-[#00e701]" : "bg-[#ff4444]"
                  }`} />
                  <span className="font-bold text-white">
                    {player.odrediserId === odrediserId ? "You" : `Player ${index + 1}`}
                    {player.odrediserId === lobby.hostId && (
                      <span className="ml-2 text-yellow-400 text-sm">(Host)</span>
                    )}
                  </span>
                </div>
                <div className={`px-3 py-1 rounded text-sm font-bold ${
                  player.ready
                    ? "bg-green-500 text-black"
                    : "bg-gray-600 text-gray-300"
                }`}>
                  {player.ready ? "READY" : "NOT READY"}
                </div>
              </div>
            );
          })}

          {/* Green team bot/waiting slots */}
          {Array.from({ length: greenSlotsNeeded }).map((_, i) => (
            <div key={`green-slot-${i}`} className="p-4 rounded-lg flex items-center justify-between bg-[#0f212e] border-2 border-gray-700 opacity-60">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-[#00e701]" />
                <span className="font-bold text-white">
                  {fillMode === "bots" ? `Green Bot ${greenSlotsNeeded > 1 ? i + 1 : ""}`.trim() : "Waiting for player..."}
                </span>
              </div>
              <div className={`px-3 py-1 rounded text-sm font-bold ${
                fillMode === "bots" ? "bg-blue-500 text-white" : "bg-gray-600 text-gray-300"
              }`}>
                {fillMode === "bots" ? "BOT" : "..."}
              </div>
            </div>
          ))}
        </div>

        {/* Red Team */}
        {isTeamMode && redSlotsNeeded > 0 && (
          <div className="space-y-3 mb-6">
            <p className="text-sm font-bold text-[#ff4444] uppercase tracking-wide">Red Team</p>
            {Array.from({ length: redSlotsNeeded }).map((_, i) => (
              <div key={`red-slot-${i}`} className="p-4 rounded-lg flex items-center justify-between bg-[#0f212e] border-2 border-gray-700 opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-[#ff4444]" />
                  <span className="font-bold text-white">
                    {fillMode === "bots" ? `Red Bot ${redSlotsNeeded > 1 ? i + 1 : ""}`.trim() : "Waiting for player..."}
                  </span>
                </div>
                <div className={`px-3 py-1 rounded text-sm font-bold ${
                  fillMode === "bots" ? "bg-blue-500 text-white" : "bg-gray-600 text-gray-300"
                }`}>
                  {fillMode === "bots" ? "BOT" : "..."}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fill Mode Selector (host only, team modes only, waiting status only) */}
        {isHost && isTeamMode && lobby.status === "waiting" && (
          <div className="mb-4">
            <p className="text-gray-400 text-sm mb-2">Fill remaining slots with:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSetFillMode("bots")}
                className={`py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  fillMode === "bots"
                    ? "bg-blue-500 text-white border-2 border-blue-400"
                    : "bg-[#0f212e] text-gray-400 border-2 border-gray-700 hover:border-gray-500"
                }`}
              >
                Bots (instant)
              </button>
              <button
                onClick={() => onSetFillMode("players")}
                className={`py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  fillMode === "players"
                    ? "bg-purple-500 text-white border-2 border-purple-400"
                    : "bg-[#0f212e] text-gray-400 border-2 border-gray-700 hover:border-gray-500"
                }`}
              >
                Online Players
              </button>
            </div>
          </div>
        )}

        {/* Bot Difficulty Selector (host only, bots mode, waiting status only) */}
        {isHost && fillMode === "bots" && lobby.status === "waiting" && (
          <div className="mb-4">
            <p className="text-gray-400 text-sm mb-2">Bot Difficulty:</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onSetBotDifficulty("easy")}
                className={`py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  botDifficulty === "easy"
                    ? "bg-green-500 text-black border-2 border-green-400"
                    : "bg-[#0f212e] text-gray-400 border-2 border-gray-700 hover:border-gray-500"
                }`}
              >
                Easy
              </button>
              <button
                onClick={() => onSetBotDifficulty("medium")}
                className={`py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  botDifficulty === "medium"
                    ? "bg-yellow-500 text-black border-2 border-yellow-400"
                    : "bg-[#0f212e] text-gray-400 border-2 border-gray-700 hover:border-gray-500"
                }`}
              >
                Medium
              </button>
              <button
                onClick={() => onSetBotDifficulty("hard")}
                className={`py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  botDifficulty === "hard"
                    ? "bg-red-500 text-white border-2 border-red-400"
                    : "bg-[#0f212e] text-gray-400 border-2 border-gray-700 hover:border-gray-500"
                }`}
              >
                Hard
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {lobby.status === "matchmaking" ? (
          <div className="text-center space-y-3">
            <div className="text-2xl animate-pulse text-purple-400 font-bold">
              Searching for players...
            </div>
            <p className="text-gray-400 text-sm">Waiting for online opponents to join</p>
            <button
              onClick={onLeave}
              className="w-full font-bold py-3 px-6 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-all"
            >
              Cancel
            </button>
          </div>
        ) : countdown === null ? (
          <div className="space-y-3">
            <button
              onClick={onReady}
              className={`w-full font-bold py-3 px-6 rounded-lg transition-all ${
                isReady
                  ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                  : "bg-[#00e701] hover:bg-[#00ff00] text-black"
              }`}
            >
              {isReady ? "Cancel Ready" : "Ready Up!"}
            </button>
            <button
              onClick={onLeave}
              className="w-full font-bold py-3 px-6 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-all"
            >
              Leave Lobby
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-6xl font-black text-[#00e701] animate-pulse">
              {countdown}
            </div>
            <p className="text-gray-400 mt-2">Get ready!</p>
          </div>
        )}

        {/* Game Info */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <div className="text-center text-gray-400 text-sm">
            <p>Game Type: <span className="text-white font-bold">{lobby.gameType}</span></p>
            <p className="mt-1">Lobby ID: <span className="text-gray-500">{lobby.lobbyId.slice(0, 12)}...</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
