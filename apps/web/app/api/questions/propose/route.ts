import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json() as { question?: string; proposerAddress?: string };
  const question = body.question?.trim();
  if (!question || question.length < 8) return NextResponse.json({ error: "Question is too short" }, { status: 400 });
  return NextResponse.json({ status: "pending", question, proposerAddress: body.proposerAddress ?? null });
}
