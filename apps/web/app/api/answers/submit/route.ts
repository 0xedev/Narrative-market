import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json() as { questionId?: string; answer?: string };
  const answer = body.answer?.trim().replace(/\s+/g, " ").toLowerCase();
  if (!body.questionId || !answer) return NextResponse.json({ error: "questionId and answer are required" }, { status: 400 });
  const answerHash = `0x${createHash("sha256").update(`${body.questionId}:${answer}`).digest("hex")}`;
  return NextResponse.json({ questionId: body.questionId, answer, answerHash });
}
