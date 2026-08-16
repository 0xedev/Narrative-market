import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@narrative/db";

export async function POST(request: Request) {
  const body = await request.json() as { questionId?: string; answer?: string };
  const answer = body.answer?.trim().replace(/\s+/g, " ").toLowerCase();
  if (!body.questionId || !answer) return NextResponse.json({ error: "questionId and answer are required" }, { status: 400 });
  const answerHash = `0x${createHash("sha256").update(`${body.questionId}:${answer}`).digest("hex")}`;
  try {
    const address = "0x0000000000000000000000000000000000000000";
    await db.question.upsert({
      where: { id: body.questionId },
      update: {},
      create: {
        id: body.questionId,
        text: "Today’s narrative",
        proposerAddress: address,
        curatorAddress: address,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "ACTIVE"
      }
    });
    await db.user.upsert({ where: { address }, update: {}, create: { address } });
    await db.answer.upsert({
      where: { questionId_answerHash_holderAddress: { questionId: body.questionId, answerHash, holderAddress: address } },
      update: { answerText: body.answer!.trim(), normalized: answer },
      create: { questionId: body.questionId, holderAddress: address, answerHash, answerText: body.answer!.trim(), normalized: answer }
    });
  } catch (error) {
    console.warn("Answer stored for chain registration but database persistence is unavailable", error);
  }
  return NextResponse.json({ questionId: body.questionId, answer, answerHash });
}
