"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ENTRY_FEE = 10;
const WINNING_PRIZE = 30;
const MAX_NUMBER = 10;
const MAX_ATTEMPTS = 3;

export default function NumberGuesserGame() {
  const [balance, setBalance] = useState<number | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [targetNumber, setTargetNumber] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const router = useRouter();

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
    if (balance === null || balance < ENTRY_FEE) {
      setMessage("Insufficient balance!");
      return;
    }

    try {
      // Spend coins
      const response = await fetch("/api/coins/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: ENTRY_FEE,
          description: "Number Guesser entry fee",
          gameId: "number-guesser",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance);
        setTargetNumber(Math.floor(Math.random() * MAX_NUMBER) + 1);
        setGameStarted(true);
        setAttempts(0);
        setMessage("");
        setGameOver(false);
        setWon(false);
        setGuess("");
      } else {
        const data = await response.json();
        setMessage(data.error || "Failed to start game");
      }
    } catch (error) {
      setMessage("Error starting game");
    }
  };

  const makeGuess = () => {
    if (!targetNumber || gameOver) return;

    const guessNum = parseInt(guess);
    if (isNaN(guessNum) || guessNum < 1 || guessNum > MAX_NUMBER) {
      setMessage(`Please enter a number between 1 and ${MAX_NUMBER}`);
      return;
    }

    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    if (guessNum === targetNumber) {
      handleWin();
    } else if (newAttempts >= MAX_ATTEMPTS) {
      handleLoss();
    } else {
      if (guessNum < targetNumber) {
        setMessage(`Too low! ${MAX_ATTEMPTS - newAttempts} attempts left`);
      } else {
        setMessage(`Too high! ${MAX_ATTEMPTS - newAttempts} attempts left`);
      }
      setGuess("");
    }
  };

  const handleWin = async () => {
    setWon(true);
    setGameOver(true);
    setMessage(`🎉 You won! The number was ${targetNumber}!`);

    try {
      const response = await fetch("/api/coins/earn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: WINNING_PRIZE,
          description: "Number Guesser win",
          gameId: "number-guesser",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setBalance(data.balance);
      }
    } catch (error) {
      console.error("Error claiming prize:", error);
    }
  };

  const handleLoss = () => {
    setGameOver(true);
    setMessage(`😔 Game over! The number was ${targetNumber}. Try again!`);
  };

  const resetGame = () => {
    setGameStarted(false);
    setTargetNumber(null);
    setGuess("");
    setAttempts(0);
    setMessage("");
    setGameOver(false);
    setWon(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-800 font-semibold"
          >
            ← Back
          </Link>
          <div className="bg-yellow-400 px-4 py-2 rounded-lg font-bold">
            💰 {balance !== null ? balance : "..."} coins
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
          Number Guesser
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Guess the number between 1 and {MAX_NUMBER}
        </p>

        <div className="bg-blue-50 p-4 rounded-lg mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-gray-700">Entry Fee:</span>
            <span className="font-bold text-red-600">{ENTRY_FEE} coins</span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-gray-700">Prize:</span>
            <span className="font-bold text-green-600">{WINNING_PRIZE} coins</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-700">Attempts:</span>
            <span className="font-bold text-blue-600">{MAX_ATTEMPTS}</span>
          </div>
        </div>

        {!gameStarted ? (
          <button
            onClick={startGame}
            disabled={balance === null || balance < ENTRY_FEE}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {balance === null
              ? "Loading..."
              : balance < ENTRY_FEE
              ? "Insufficient Balance"
              : "Start Game"}
          </button>
        ) : (
          <div>
            <div className="mb-4">
              <p className="text-center text-gray-700 mb-2">
                Attempts: {attempts}/{MAX_ATTEMPTS}
              </p>
              {message && (
                <div
                  className={`p-3 rounded-lg text-center ${
                    won
                      ? "bg-green-100 text-green-800"
                      : gameOver
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {message}
                </div>
              )}
            </div>

            {!gameOver && (
              <div className="space-y-4">
                <input
                  type="number"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && makeGuess()}
                  min="1"
                  max={MAX_NUMBER}
                  placeholder={`Enter 1-${MAX_NUMBER}`}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl font-bold text-gray-900"
                  autoFocus
                />
                <button
                  onClick={makeGuess}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition"
                >
                  Guess!
                </button>
              </div>
            )}

            {gameOver && (
              <button
                onClick={resetGame}
                className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition mt-4"
              >
                Play Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
