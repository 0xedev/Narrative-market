import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    id: "0x" + "11".repeat(32),
    text: "Who owns the internet today?",
    status: "active",
    currentHolder: "0x0000000000000000000000000000000000000000",
    currentAnswer: "Decentralized communities.",
    currentPriceEth: "0.0012",
    endsAt: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString()
  });
}
