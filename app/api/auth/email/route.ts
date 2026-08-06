import { NextResponse } from "next/server";
import {
  absoluteRequestUrl,
  createCyberusSessionCookie,
  safeRelativeReturnPath,
} from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const returnTo = safeRelativeReturnPath(
    typeof form.get("return_to") === "string"
      ? (form.get("return_to") as string)
      : "/app",
  );
  const email = normalizeEmail(form.get("email"));

  if (!email) {
    return NextResponse.redirect(
      absoluteRequestUrl(
        request,
        `/login?error=email&return_to=${encodeURIComponent(returnTo)}`,
      ),
      303,
    );
  }

  const response = NextResponse.redirect(absoluteRequestUrl(request, returnTo), 303);
  const sessionCookie = createCyberusSessionCookie({
    email,
    displayName: email.split("@")[0],
    fullName: null,
    provider: "email",
  });
  response.cookies.set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.options,
  );
  return response;
}

function normalizeEmail(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase().slice(0, 160);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}
