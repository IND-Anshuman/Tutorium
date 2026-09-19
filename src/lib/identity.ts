// Identity resolution: the server NEVER trusts a client-supplied userId.
// Clerk owns identity when configured; a demo fallback exists ONLY when Clerk
// keys are absent (local dev without keys). On a deployed service with keys
// set, unauthenticated requests are rejected by middleware — no backdoor.
import { auth } from "@clerk/nextjs/server";

const CLERK_CONFIGURED = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

export function clerkConfigured(): boolean {
  return CLERK_CONFIGURED;
}

// In-memory cache of userId → deterministic name so Clerk users get a stable
// display identity in the DB across requests.
const nameCache = new Map<string, string>();

export async function requireUserId(): Promise<string> {
  if (CLERK_CONFIGURED) {
    const { userId } = await auth();
    if (userId) return `clerk:${userId}`;
    // Middleware guards pages/APIs; this path only runs if middleware missed.
    throw new Error("Sign in to use Tutorium.");
  }
  return "demo-user";
}

export async function requireUserDisplayName(): Promise<string> {
  const id = await requireUserId();
  if (nameCache.has(id)) return nameCache.get(id)!;
  if (CLERK_CONFIGURED) {
    try {
      const { userId, sessionClaims } = await auth();
      const name =
        (sessionClaims?.firstName as string | undefined) ||
        (sessionClaims?.username as string | undefined) ||
        "Learner";
      nameCache.set(id, name);
      return name;
    } catch {
      return "Learner";
    }
  }
  nameCache.set(id, "Demo user");
  return "Demo user";
}