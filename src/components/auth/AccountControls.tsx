"use client";

import { useAuth, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

// Prerender-safe account controls: no RSC-only <SignedIn>/<SignedOut> during build.
export default function AccountControls() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <UserButton />;
  return (
    <>
      <SignInButton mode="modal">
        <button className="btn btn-ghost clerk-btn">Sign in</button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="btn btn-primary clerk-btn">Create account</button>
      </SignUpButton>
    </>
  );
}
