import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public: health probe, Clerk's own handlers, Next internals.
const isPublic = createRouteMatcher(["/api/health", "/sign-in(.*)", "/sign-up(.*)", "/_clerk(.*)"]);

// Read key presence LIVE: containers may deploy with or without Clerk. When absent
// (local dev), fall through unauthenticated instead of hard-failing the edge runtime.
const CLERK_ON = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

const clerkHandler = clerkMiddleware(async (auth, req: NextRequest) => {
  if (isPublic(req)) return NextResponse.next();
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

export default function middleware(req: NextRequest, event: unknown) {
  if (!CLERK_ON) {
    // Demo/dev mode: no Clerk configured → everything passes (identity.ts uses demo-user).
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
