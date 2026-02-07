import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/friends/request - Send friend request
export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { friendUsername } = await req.json();

    if (!friendUsername) {
      return NextResponse.json(
        { error: "Friend username is required" },
        { status: 400 }
      );
    }

    // Find the user to add as friend
    const friendUser = await prisma.user.findUnique({
      where: { username: friendUsername },
    });

    if (!friendUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (friendUser.id === session.user.id) {
      return NextResponse.json(
        { error: "You cannot add yourself as a friend" },
        { status: 400 }
      );
    }

    // Check if already friends
    const existingFriendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId: session.user.id, friendId: friendUser.id },
          { userId: friendUser.id, friendId: session.user.id },
        ],
      },
    });

    if (existingFriendship) {
      return NextResponse.json(
        { error: "Already friends" },
        { status: 400 }
      );
    }

    // Check if request already exists
    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: session.user.id, receiverId: friendUser.id },
          { senderId: friendUser.id, receiverId: session.user.id },
        ],
        status: "PENDING",
      },
    });

    if (existingRequest) {
      return NextResponse.json(
        { error: "Friend request already exists" },
        { status: 400 }
      );
    }

    // Create friend request
    const friendRequest = await prisma.friendRequest.create({
      data: {
        senderId: session.user.id,
        receiverId: friendUser.id,
        status: "PENDING",
      },
      include: {
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ request: friendRequest });
  } catch (error) {
    console.error("Failed to send friend request:", error);
    return NextResponse.json(
      { error: "Failed to send friend request" },
      { status: 500 }
    );
  }
}
