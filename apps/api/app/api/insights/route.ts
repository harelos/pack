import { NextRequest, NextResponse } from "next/server";
import { buildInsightFeed } from "@pack/db";
import { requireUserId } from "../../../lib/auth";

export const runtime = "nodejs";

// GET /api/insights?exerciseId=<uuid>  -> only cards with a surfaced message.
export async function GET(req: NextRequest) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const exerciseId = req.nextUrl.searchParams.get("exerciseId") ?? undefined;
  const cards = await buildInsightFeed(userId, exerciseId);
  return NextResponse.json({ cards });
}
