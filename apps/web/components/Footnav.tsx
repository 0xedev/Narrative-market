"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { narrativeThroneAbi } from "../lib/abi";

const contractAddress = process.env.NEXT_PUBLIC_NARRATIVE_THRONE_ADDRESS as `0x${string}` | undefined;
const readAddress = (contractAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export function Footnav() {
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
    <nav className="footnav">
      <Link className={`footnav-item ${pathname === "/" ? "active" : ""}`} href="/">
        <span className="footnav-icon">♛</span>
        <span className="footnav-label">Today</span>
      </Link>
      <Link className={`footnav-item ${pathname === "/history" ? "active" : ""}`} href="/history">
        <span className="footnav-icon">◷</span>
        <span className="footnav-label">History</span>
      </Link>
      <Link className={`footnav-item ${pathname === "/leaderboard" ? "active" : ""}`} href="/leaderboard">
        <span className="footnav-icon">♜</span>
        <span className="footnav-label">Board</span>
      </Link>
      <Link className={`footnav-item ${pathname === "/stats" ? "active" : ""}`} href="/stats">
        <span className="footnav-icon">⌁</span>
        <span className="footnav-label">Stats</span>
      </Link>
      <Link className={`footnav-item ${pathname === "/propose" ? "active" : ""}`} href="/propose">
        <span className="footnav-icon">＋</span>
        <span className="footnav-label">Propose</span>
      </Link>
      {isOwner && (
        <Link className={`footnav-item ${pathname === "/admin" ? "active admin-tab" : "admin-tab"}`} href="/admin">
          <span className="footnav-icon">⚙</span>
          <span className="footnav-label">Admin</span>
        </Link>
      )}
    </nav>
  );
}