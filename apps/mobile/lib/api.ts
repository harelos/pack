import Constants from "expo-constants";
import type { ParsedLog } from "@pack/parser";

const BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "http://localhost:3000";

export interface ParseResponse {
  parse: ParsedLog;
  overallConfidence: number;
  model: string;
  parserVersion: string;
}

// One idempotency token per compose session; reused on double-tap (Section 10b).
export async function parse(
  text: string,
  source: "text" | "voice" | "photo",
  idempotencyKey: string,
  accessToken: string
): Promise<ParseResponse> {
  const res = await fetch(`${BASE}/api/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text, source }),
  });
  if (!res.ok) throw new Error(`Parse failed: ${res.status}`);
  return res.json();
}
