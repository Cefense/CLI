import { NextResponse } from "next/server";
import {
  absoluteRequestUrl,
  createCyberusSessionCookie,
  safeRelativeReturnPath,
} from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeRelativeReturnPath(
    url.searchParams.get("return_to") ?? "/app",
  );
  const guestId = crypto.randomUUID().slice(0, 8);
  const response = NextResponse.redirect(absoluteRequestUrl(request, returnTo), 303);
  const sessionCookie = createCyberusSessionCookie({
    email: `guest-${guestId}@cyberus.local`,
    displayName: "Guest",
    fullName: null,
    provider: "guest",
  });
  response.cookies.set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.options,
  );
  return response;
}
