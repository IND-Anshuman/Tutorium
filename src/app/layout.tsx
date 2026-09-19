import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import AccountControls from "@/components/auth/AccountControls";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tutorium — say less, learn more",
  description: "Voice-first AI tutor: speak your question, get an interactive lesson.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider dynamic>
          <html lang="en">
            <body className="min-h-screen">
              <div className="clerk-controls" role="region" aria-label="Account">
                <AccountControls />
              </div>
              {children}
            </body>
          </html>
        </ClerkProvider>
  );
}
