import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public: health probe, Clerk's own handlers, Next internals.
const isPublic = createRouteMatcher(["/api/health", "/sign-in(.*)", "/sign-up(.*)", "/_clerk(.*)"]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
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

export const config = {
  matcher: [
    // Skip Next internals + static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};