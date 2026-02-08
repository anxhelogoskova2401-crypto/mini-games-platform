import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const STARTING_COINS = 100;

export async function POST(req: NextRequest) {
  try {
    const { email, username, password } = await req.json();

    if (!email || !username || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email or username already exists" },
        { status: 400 }
      );
    }

    // Hash password and generate verification token
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Create user and wallet in a transaction
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        emailVerified: false,
        verificationToken,
        wallet: {
          create: {
            balance: STARTING_COINS,
            transactions: {
              create: {
                type: "BONUS",
                amount: STARTING_COINS,
                description: "Welcome bonus",
              },
            },
          },
        },
      },
      include: {
        wallet: true,
      },
    });

    // Send verification email
    const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
    const verifyUrl = `${baseUrl}/api/auth/verify?token=${verificationToken}`;

    let emailSent = false;
    let emailError = null;
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: process.env.EMAIL_FROM || "MiniGames <onboarding@resend.dev>",
        to: email,
        subject: "Verify your MiniGames account",
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #f5c542; text-align: center;">MiniGames</h1>
            <p>Hey <strong>${username}</strong>,</p>
            <p>Click the button below to verify your email and start playing!</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="background: #f5c542; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                Verify Email
              </a>
            </div>
            <p style="color: #888; font-size: 12px;">If the button doesn't work, copy this link: ${verifyUrl}</p>
          </div>
        `,
      });
      if (result.error) {
        console.error("Resend error:", result.error);
        emailError = result.error.message;
      } else {
        emailSent = true;
      }
    } catch (err: any) {
      console.error("Failed to send verification email:", err);
      emailError = err.message || "Unknown email error";
    }

    return NextResponse.json(
      {
        message: emailSent
          ? "Account created! Please check your email to verify."
          : `Account created but verification email failed: ${emailError}. Contact support.`,
        emailSent,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          wallet: {
            balance: user.wallet?.balance,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
