import type { Metadata } from "next";
import { ClerkProvider, SignInButton, SignUpButton, UserButton, SignedIn, SignedOut } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tutorium — say less, learn more",
  description: "Voice-first AI tutor: speak your question, get an interactive lesson.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      <body className="min-h-screen">
        <div className="clerk-controls" role="region" aria-label="Account">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="btn btn-ghost clerk-btn">Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="btn btn-primary clerk-btn">Create account</button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
        {children}
      </body>
    </ClerkProvider>
  );
}