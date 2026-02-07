import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SlitherMultiplayerGame from "@/components/SlitherMultiplayerGame";

export default async function SlitherBattlePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <SlitherMultiplayerGame user={session.user} />;
}
