"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { narrativeThroneAbi } from "../lib/abi";
import { WalletButton } from "./WalletButton";

const contractAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;
const readAddress = (contractAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export function Navbar() {
  const pathname = usePathname();
  const { address } = useAccount();

  const ownerRead = useReadContract({
    address: readAddress,
    abi: narrativeThroneAbi,
    functionName: "owner",
    query: { enabled: Boolean(contractAddress), refetchInterval: 30_000 }
  });

  const isOwner = Boolean(
    address && (
      (ownerRead.data && address.toLowerCase() === String(ownerRead.data).toLowerCase()) ||
      (process.env.NEXT_PUBLIC_ADMIN_ADDRESS && address.toLowerCase() === process.env.NEXT_PUBLIC_ADMIN_ADDRESS.toLowerCase())
    )
  );

  return (
    <header className="topbar">
      <Link className="brand" href="/">Narrative Markets</Link>
      <nav className="nav">
        <Link className={pathname === "/" ? "active" : ""} href="/">♛ Home</Link>
        <Link className={pathname === "/history" ? "active" : ""} href="/history">◷ History</Link>
        <Link className={pathname === "/leaderboard" ? "active" : ""} href="/leaderboard">♜ Leaderboard</Link>
        <Link className={pathname === "/stats" ? "active" : ""} href="/stats">⌁ My Stats</Link>
        <Link className={pathname === "/propose" ? "active" : ""} href="/propose">＋ Propose</Link>
        {isOwner && (
          <Link className={pathname === "/admin" ? "active admin-tab" : "admin-tab"} href="/admin">
            ⚙ Admin
          </Link>
        )}
      </nav>
      <div className="topbar-actions">
        <WalletButton />
      </div>
    </header>
  );
}