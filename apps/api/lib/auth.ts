import { NextRequest } from "next/server";
import { prisma } from "@pack/db";

/**
 * Resolve the app user id from the Supabase JWT in the Authorization header.
 * Verifies the token against Supabase, then maps auth.uid() -> our User row.
 * RLS is the real guard; this is the app-layer resolution of "who is calling".
 */
export async function requireUserId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const { id: authId, email } = (await res.json()) as { id: string; email: string };
  if (!authId) return null;

  // Upsert the app User on first sight (guest -> linked account, Section 10e onboarding).
  const user = await prisma.user.upsert({
    where: { authId },
    update: {},
    create: { authId, email, streak: { create: { graceResetAt: new Date() } } },
    select: { id: true },
  });
  return user.id;
}
