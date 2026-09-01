import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "../components/Navbar";
import { Footnav } from "../components/Footnav";

export const metadata: Metadata = {
  title: "Narrative Markets — Rule today",
  description: "A daily on-chain competition for the longest-held narrative."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="shell">
            <Navbar />
            {children}
            <Footnav />
          </div>
        </Providers>
      </body>
    </html>
  );
}

