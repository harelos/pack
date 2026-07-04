import { NextRequest, NextResponse } from "next/server";
import { parseLog, computeOverallConfidence } from "@pack/parser";
import type { ParseInput } from "@pack/parser";
import { persistParse } from "@pack/db";
import { requireUserId } from "../../../lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

// In-flight lock keyed by idempotency token (Blueprint Section 10b: prevent duplicate writes).
const inflight = new Map<string, Promise<unknown>>();

function killSwitchActive(): boolean {
  // Wire to your spend meter. Placeholder reads an env threshold flag.
  return process.env.PARSER_FORCE_CHEAP === "1";
}

export async function POST(req: NextRequest) {
  const idem = req.headers.get("idempotency-key");
  if (!idem) {
    return NextResponse.json({ error: "Idempotency-Key header required" }, { status: 400 });
  }

  // Second submit of the same token returns the same in-flight promise (no dup parse).
  if (inflight.has(idem)) {
    const cached = await inflight.get(idem);
    return NextResponse.json(cached);
  }

  const body = (await req.json()) as ParseInput;
  if (!body?.text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = (async () => {
    const result = await parseLog(body, { killSwitchActive: killSwitchActive() });
    const overallConfidence = computeOverallConfidence(result.data);

    // Server-owned state (Section 10n): we persist, client renders what we return.
    const { entryId, status } = await persistParse({
      userId,
      parsed: result.data,
      source: body.source,
      rawInputText: body.text,
      parserModel: result.model,
      parserVersion: result.parserVersion,
      overallConfidence,
    });

    return {
      entryId,
      status,
      parse: result.data,
      overallConfidence,
      model: result.model,
      parserVersion: result.parserVersion,
      usage: result.usage,
    };
  })();

  inflight.set(idem, job);
  try {
    const out = await job;
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    // Keep the token briefly to absorb rapid double-taps, then release.
    setTimeout(() => inflight.delete(idem), 5000);
  }
}
