import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

// Public paths via native matching — createRouteMatcher() is deprecated in
// Clerk v7 (removal next major). Resource-level checks still exist in every
// API route (requireUserId) and the fail-closed branch; this proxy layer is
// the early-redirect/UX gate, not the only one.
const PUBLIC_PATH = /^\/(api\/health|sign-in|sign-up|_clerk)(\/|$|\?)/;

// Read key presence LIVE: containers may deploy with or without Clerk. When absent
// (local dev), fall through unauthenticated instead of hard-failing the edge runtime.
const CLERK_ON = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

// Hard cap matched to the /api/ingest route's 15MB limit. We check Content-Length
// before anything reads the body so Next's 10MB middleware-buffer warning
// ("Request body exceeded 10MB...") never fires. Multipart boundary pushes the
// true wire size a hair above the file size; we round up generously.
const MAX_INGEST_BYTES = 16 * 1024 * 1024; // 16MB

const clerkHandler = clerkMiddleware(async (auth, req: NextRequest) => {
  if (PUBLIC_PATH.test(req.nextUrl.pathname)) return NextResponse.next();
  // Body-size gate: cheaper than letting Next double-buffer an oversize body.
  // Only enforced on upload routes; everything else is small JSON.
  if (req.nextUrl.pathname === "/api/ingest") {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_INGEST_BYTES) {
      return NextResponse.json(
        { error: `file too large (max 15 MB, got ${(len / 1024 / 1024).toFixed(1)} MB)` },
        { status: 413 },
      );
    }
  }
  const { userId } = await auth();
  if (!userId) {
    // API: 401 JSON the client can surface. Pages: redirect to sign-in.
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in to use Tutorium." }, { status: 401 });
    }
    const signIn = new URL("/sign-in", req.nextUrl.origin);
    signIn.searchParams.set("redirect_url", req.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
});

// Proxy convention (Next 16): renamed from middleware.ts per deprecation notice.
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!CLERK_ON) {
    // No Clerk keys configured. Dev/demo convenience: pass through (identity.ts
    // uses demo-user). But a PRODUCTION deployment without auth must fail CLOSED:
    // an open service would let anyone spend paid LLM/STT tokens. Misconfiguration
    // must be loud (401/503), never a silent auth bypass.
    if (process.env.NODE_ENV === "production") {
          // Health probe must stay reachable even when misconfigured, or the Cloud Run
          // liveness check restart-loops the container.
          if (req.nextUrl.pathname === "/api/health") return NextResponse.next();
          if (req.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Auth not configured: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY (see DEPLOYMENT.md)." },
          { status: 401 }
        );
      }
      return new NextResponse("Tutorium is misconfigured: auth keys missing (see DEPLOYMENT.md).", { status: 503 });
    }
    return NextResponse.next();
  }
  return clerkHandler(req, event);
}

export const config = {
  matcher: [
    // Skip Next internals + static files
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
