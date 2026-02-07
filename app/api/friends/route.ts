// app/api/friends/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/friends - Get user's friends list
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const friends = await prisma.friend.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        friend: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    // 🔑 infer the exact type from the query result
    type FriendWithUsers = typeof friends[number];

    const friendsList = friends.map((friendship: FriendWithUsers) => {
      const isInitiator = friendship.userId === userId;

      return {
        id: friendship.id,
        friendshipId: friendship.id,
        user: isInitiator ? friendship.friend : friendship.user,
        createdAt: friendship.createdAt,
      };
    });

    return NextResponse.json({ friends: friendsList });
  } catch (error) {
    console.error("Failed to fetch friends:", error);
    return NextResponse.json(
      { error: "Failed to fetch friends" },
      { status: 500 }
    );
  }
}
