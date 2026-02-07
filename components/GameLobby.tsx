"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
}

interface GameLobbyProps {
  lobby: LobbyData;
  odrediserId: string;
  onReady: () => void;
  onLeave: () => void;
  countdown: number | null;
}

export default function GameLobby({ lobby, odrediserId, onReady, onLeave, countdown }: GameLobbyProps) {
  const router = useRouter();
  const currentPlayer = lobby.players.find(p => p.odrediserId === odrediserId);
  const isReady = currentPlayer?.ready || false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
      <div className="bg-[#1a2c38] p-8 rounded-xl max-w-md w-full mx-4 border-2 border-[#00e701]">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-black text-white mb-2">
            {lobby.gameType === "1v1" ? "1v1" : "2v2"} Game Lobby
          </h2>
          <p className="text-gray-400">
            {countdown !== null
              ? `Starting in ${countdown}...`
              : "Waiting for players to ready up"}
          </p>
        </div>

        {/* Players */}
        <div className="space-y-3 mb-6">
          {lobby.players.map((player, index) => (
            <div
              key={player.odrediserId}
              className={`p-4 rounded-lg flex items-center justify-between ${
                player.ready ? "bg-green-900/30 border-green-500" : "bg-[#0f212e]"
              } border-2 ${player.ready ? "border-green-500" : "border-gray-700"}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full ${
                  index === 0 ? "bg-[#00e701]" : "bg-[#ff4444]"
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
          ))}

          {/* Bot slots for 2v2 */}
          {lobby.gameType === "2v2" && (
            <>
              <div className="p-4 rounded-lg flex items-center justify-between bg-[#0f212e] border-2 border-gray-700 opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-[#00e701]" />
                  <span className="font-bold text-white">Green Bot</span>
                </div>
                <div className="px-3 py-1 rounded text-sm font-bold bg-blue-500 text-white">
                  BOT
                </div>
              </div>
              <div className="p-4 rounded-lg flex items-center justify-between bg-[#0f212e] border-2 border-gray-700 opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-[#ff4444]" />
                  <span className="font-bold text-white">Red Bot</span>
                </div>
                <div className="px-3 py-1 rounded text-sm font-bold bg-blue-500 text-white">
                  BOT
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {countdown === null ? (
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
