"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";
import GameLobby from "./GameLobby";

interface Friend {
  id: string;
  friendshipId: string;
  user: {
    id: string;
    username: string;
    email: string;
  };
  online?: boolean;
}

interface FriendRequest {
  id: string;
  sender: {
    id: string;
    username: string;
    email: string;
  };
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  email: string;
}

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
}

interface FriendsSidebarProps {
  userId: string;
}

export default function FriendsSidebar({ userId }: FriendsSidebarProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "add">("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [socketRef, setSocketRef] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{
    inviteId: string;
    senderId: string;
    gameType: string;
  } | null>(null);
  const [currentLobby, setCurrentLobby] = useState<LobbyData | null>(null);
  const [lobbyCountdown, setLobbyCountdown] = useState<number | null>(null);

  // Connect to Socket.IO for presence
  useEffect(() => {
    const socket = getSocket();

    socket.on("connect", () => {
      socket.emit("user-online", { userId });
    });

    socket.on("online-users", (users: string[]) => {
      setOnlineUsers(new Set(users));
    });

    socket.on("user-status-changed", ({ userId, online }: { userId: string; online: boolean }) => {
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        if (online) {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    });

    socket.on("game-invite-received", (data: { inviteId: string; senderId: string; gameType: string }) => {
      setPendingInvite(data);
    });

    socket.on("invite-rejected", () => {
      alert("Your friend rejected the invitation");
    });

    // Lobby events
    socket.on("lobby-created", (data: LobbyData) => {
      setCurrentLobby(data);
      setLobbyCountdown(null);
    });

    socket.on("lobby-updated", (data: LobbyData) => {
      setCurrentLobby(data);
    });

    socket.on("lobby-countdown", (data: { lobbyId: string; seconds: number }) => {
      setLobbyCountdown(data.seconds);

      // Countdown timer
      let count = data.seconds;
      const interval = setInterval(() => {
        count--;
        setLobbyCountdown(count);
        if (count <= 0) {
          clearInterval(interval);
        }
      }, 1000);
    });

    socket.on("lobby-game-start", (data: { lobbyId: string; gameId: string; playerId: string; gameType: string }) => {
      // Store game info in sessionStorage for the game page to pick up
      sessionStorage.setItem("lobbyGameData", JSON.stringify(data));
      // Navigate to the game
      router.push("/games/slither-battle?fromLobby=true");
    });

    socket.on("lobby-closed", (data: { lobbyId: string; reason: string }) => {
      setCurrentLobby(null);
      setLobbyCountdown(null);
      alert(`Lobby closed: ${data.reason}`);
    });

    socket.on("lobby-matchmaking-started", () => {
      setCurrentLobby((prev) => prev ? { ...prev, status: "matchmaking" } : null);
    });

    // When lobby matchmaking finds a game (players fill mode)
    socket.on("match-found", (data: { gameId: string; playerId: string }) => {
      sessionStorage.setItem("lobbyGameData", JSON.stringify({
        gameId: data.gameId,
        playerId: data.playerId,
        gameType: currentLobby?.gameType || "5v5",
      }));
      setCurrentLobby(null);
      router.push("/games/slither-battle?fromLobby=true");
    });

    setSocketRef(socket);

    return () => {
      socket.off("connect");
      socket.off("online-users");
      socket.off("user-status-changed");
      socket.off("game-invite-received");
      socket.off("invite-rejected");
      socket.off("lobby-created");
      socket.off("lobby-updated");
      socket.off("lobby-countdown");
      socket.off("lobby-game-start");
      socket.off("lobby-closed");
      socket.off("lobby-matchmaking-started");
      socket.off("match-found");
    };
  }, [userId, router]);

  // Fetch friends
  useEffect(() => {
    fetchFriends();
    fetchRequests();
  }, []);

  const fetchFriends = async () => {
    try {
      const response = await fetch("/api/friends");
      if (response.ok) {
        const data = await response.json();
        setFriends(data.friends);
      }
    } catch (error) {
      console.error("Failed to fetch friends:", error);
    }
  };

  const fetchRequests = async () => {
    try {
      const response = await fetch("/api/friends/requests");
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests);
      }
    } catch (error) {
      console.error("Failed to fetch requests:", error);
    }
  };

  const searchUsers = async () => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users);
      }
    } catch (error) {
      console.error("Failed to search users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const sendFriendRequest = async (username: string) => {
    try {
      const response = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendUsername: username }),
      });

      if (response.ok) {
        alert("Friend request sent!");
        setSearchQuery("");
        setSearchResults([]);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to send friend request");
      }
    } catch (error) {
      alert("Error sending friend request");
    }
  };

  const acceptRequest = async (requestId: string) => {
    try {
      const response = await fetch("/api/friends/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });

      if (response.ok) {
        fetchFriends();
        fetchRequests();
      }
    } catch (error) {
      console.error("Failed to accept request:", error);
    }
  };

  const rejectRequest = async (requestId: string) => {
    try {
      const response = await fetch("/api/friends/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });

      if (response.ok) {
        fetchRequests();
      }
    } catch (error) {
      console.error("Failed to reject request:", error);
    }
  };

  const removeFriend = async (friendshipId: string) => {
    if (!confirm("Are you sure you want to remove this friend?")) return;

    try {
      const response = await fetch("/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId }),
      });

      if (response.ok) {
        fetchFriends();
      }
    } catch (error) {
      console.error("Failed to remove friend:", error);
    }
  };

  const inviteFriend = (friendId: string, gameType: "1v1" | "2v2" | "5v5") => {
    if (socketRef) {
      socketRef.emit("game-invite", {
        friendId,
        gameType,
      });
      alert(`Invitation sent for ${gameType} game!`);
    }
  };

  const setFillMode = (mode: "bots" | "players") => {
    if (socketRef && currentLobby) {
      socketRef.emit("lobby-set-fill-mode", {
        lobbyId: currentLobby.lobbyId,
        fillMode: mode,
      });
    }
  };

  const acceptInvite = () => {
    if (socketRef && pendingInvite) {
      socketRef.emit("accept-invite", { inviteId: pendingInvite.inviteId });
      setPendingInvite(null);
    }
  };

  const rejectInvite = () => {
    if (socketRef && pendingInvite) {
      socketRef.emit("reject-invite", { inviteId: pendingInvite.inviteId });
      setPendingInvite(null);
    }
  };

  const handleLobbyReady = () => {
    if (socketRef && currentLobby) {
      socketRef.emit("lobby-ready", { lobbyId: currentLobby.lobbyId });
    }
  };

  const handleLobbyLeave = () => {
    if (socketRef && currentLobby) {
      socketRef.emit("lobby-leave", { lobbyId: currentLobby.lobbyId });
      setCurrentLobby(null);
      setLobbyCountdown(null);
    }
  };

  const friendsWithStatus = friends.map((friend) => ({
    ...friend,
    online: onlineUsers.has(friend.user.id),
  }));

  // Show lobby if in one
  if (currentLobby) {
    return (
      <>
        <GameLobby
          lobby={currentLobby}
          odrediserId={userId}
          onReady={handleLobbyReady}
          onLeave={handleLobbyLeave}
          countdown={lobbyCountdown}
          isHost={currentLobby.hostId === userId}
          onSetFillMode={setFillMode}
        />
        <div className="w-80 border-l p-6 flex flex-col" style={{
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border)'
        }}>
          <h2 className="text-2xl font-black mb-4" style={{ color: 'var(--text)' }}>Friends</h2>
          <div className="text-center py-4" style={{ color: 'var(--text-muted)' }}>
            You are in a game lobby...
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="w-80 border-l p-6 flex flex-col" style={{
      background: 'var(--bg-elevated)',
      borderColor: 'var(--border)'
    }}>
      <h2 className="text-2xl font-black mb-4" style={{ color: 'var(--text)' }}>Friends</h2>

      {/* Game Invitation Notification */}
      {pendingInvite && (
        <div className="mb-4 p-4 rounded-lg animate-pulse" style={{
          background: 'var(--panel)',
          border: '2px solid var(--gold)'
        }}>
          <p className="font-black mb-2" style={{ color: 'var(--gold)' }}>🎮 Game Invitation!</p>
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            Friend invited you to a {pendingInvite.gameType} match!
          </p>
          <div className="flex gap-2">
            <button
              onClick={acceptInvite}
              className="flex-1 font-bold py-2 px-4 rounded-lg transition-all"
              style={{
                background: 'var(--success)',
                color: '#000'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              Accept
            </button>
            <button
              onClick={rejectInvite}
              className="flex-1 font-bold py-2 px-4 rounded-lg transition-all"
              style={{
                background: 'var(--error)',
                color: '#fff'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("friends")}
          className="flex-1 py-2 px-4 rounded-lg font-bold transition-all"
          style={activeTab === "friends" ? {
            background: 'var(--gold)',
            color: '#000'
          } : {
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)'
          }}
        >
          Friends {friends.length > 0 && `(${friends.length})`}
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className="flex-1 py-2 px-4 rounded-lg font-bold transition-all relative"
          style={activeTab === "requests" ? {
            background: 'var(--gold)',
            color: '#000'
          } : {
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)'
          }}
        >
          Requests
          {requests.length > 0 && (
            <span className="absolute -top-1 -right-1 text-xs rounded-full w-5 h-5 flex items-center justify-center font-black" style={{
              background: 'var(--error)',
              color: '#fff'
            }}>
              {requests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("add")}
          className="py-2 px-4 rounded-lg font-bold transition-all"
          style={activeTab === "add" ? {
            background: 'var(--gold)',
            color: '#000'
          } : {
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)'
          }}
        >
          +
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "friends" && (
          <div className="space-y-2">
            {friendsWithStatus.length === 0 ? (
              <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>No friends yet. Add some friends to start playing together!</p>
            ) : (
              friendsWithStatus
                .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0))
                .map((friend) => (
                  <div
                    key={friend.id}
                    className="p-3 rounded-lg transition-all"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            background: friend.online ? 'var(--success)' : 'var(--border)',
                            animation: friend.online ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                          }}
                        />
                        <span className="font-bold" style={{ color: 'var(--text)' }}>{friend.user.username}</span>
                      </div>
                      <button
                        onClick={() => removeFriend(friend.friendshipId)}
                        className="text-sm transition-colors"
                        style={{ color: 'var(--error)' }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                      >
                        Remove
                      </button>
                    </div>
                    {friend.online && (
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          onClick={() => inviteFriend(friend.user.id, "1v1")}
                          className="text-xs py-1 px-2 rounded font-bold transition-all"
                          style={{
                            background: 'var(--accent)',
                            color: '#fff'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--accent-hover)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--accent)';
                          }}
                        >
                          1v1
                        </button>
                        <button
                          onClick={() => inviteFriend(friend.user.id, "2v2")}
                          className="text-xs py-1 px-2 rounded font-bold transition-all"
                          style={{
                            background: 'var(--panel2)',
                            border: '1px solid var(--border)',
                            color: 'var(--text)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--gold)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border)';
                          }}
                        >
                          2v2
                        </button>
                        <button
                          onClick={() => inviteFriend(friend.user.id, "5v5")}
                          className="text-xs py-1 px-2 rounded font-bold transition-all"
                          style={{
                            background: 'var(--panel2)',
                            border: '1px solid var(--border)',
                            color: 'var(--text)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--gold)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border)';
                          }}
                        >
                          5v5
                        </button>
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        )}

        {activeTab === "requests" && (
          <div className="space-y-2">
            {requests.length === 0 ? (
              <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>No pending requests</p>
            ) : (
              requests.map((request) => (
                <div
                  key={request.id}
                  className="p-3 rounded-lg"
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--border)'
                  }}
                >
                  <p className="font-bold mb-2" style={{ color: 'var(--text)' }}>{request.sender.username}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptRequest(request.id)}
                      className="flex-1 text-sm py-1 px-2 rounded font-bold transition-all"
                      style={{
                        background: 'var(--success)',
                        color: '#000'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => rejectRequest(request.id)}
                      className="flex-1 text-sm py-1 px-2 rounded font-bold transition-all"
                      style={{
                        background: 'var(--error)',
                        color: '#fff'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "add" && (
          <div>
            <input
              type="text"
              placeholder="Search username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg px-4 py-2 mb-4 transition-all"
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                color: 'var(--text)'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            />
            <div className="space-y-2">
              {loading ? (
                <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>Searching...</p>
              ) : searchResults.length === 0 && searchQuery.length >= 2 ? (
                <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>No users found</p>
              ) : (
                searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="p-3 rounded-lg flex items-center justify-between"
                    style={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <span className="font-bold" style={{ color: 'var(--text)' }}>{user.username}</span>
                    <button
                      onClick={() => sendFriendRequest(user.username)}
                      className="text-sm py-1 px-3 rounded font-bold transition-all"
                      style={{
                        background: 'var(--gold)',
                        color: '#000'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--gold-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--gold)';
                      }}
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
