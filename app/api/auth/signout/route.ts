import { NextResponse } from "next/server";
import {
  absoluteRequestUrl,
  clearCyberusSessionCookie,
  safeRelativeReturnPath,
} from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeRelativeReturnPath(
    url.searchParams.get("return_to") ?? "/",
  );
  const response = NextResponse.redirect(absoluteRequestUrl(request, returnTo), 303);
  const sessionCookie = clearCyberusSessionCookie();
  response.cookies.set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.options,
  );
  return response;
}
