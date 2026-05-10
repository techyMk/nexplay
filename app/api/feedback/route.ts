import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SUBJECT_MIN = 2;
const SUBJECT_MAX = 120;
const BODY_MIN = 5;
const BODY_MAX = 4000;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    subject,
    body: msgBody,
    email,
  } = (body as {
    subject?: string;
    body?: string;
    email?: string;
  }) ?? {};

  const trimmedSubject = typeof subject === "string" ? subject.trim() : "";
  const trimmedBody = typeof msgBody === "string" ? msgBody.trim() : "";
  const trimmedEmail = typeof email === "string" ? email.trim() : "";

  if (
    trimmedSubject.length < SUBJECT_MIN ||
    trimmedSubject.length > SUBJECT_MAX
  ) {
    return NextResponse.json(
      { error: `Subject must be ${SUBJECT_MIN}-${SUBJECT_MAX} chars` },
      { status: 400 },
    );
  }
  if (trimmedBody.length < BODY_MIN || trimmedBody.length > BODY_MAX) {
    return NextResponse.json(
      { error: `Message must be ${BODY_MIN}-${BODY_MAX} chars` },
      { status: 400 },
    );
  }
  // Email is optional; if present, do a light shape check.
  if (trimmedEmail && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
    return NextResponse.json(
      { error: "Email looks invalid" },
      { status: 400 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("feedback").insert({
    user_id: user?.id ?? null,
    email: trimmedEmail || user?.email || null,
    subject: trimmedSubject,
    body: trimmedBody,
  });

  if (error) {
    console.error("[POST /api/feedback]", error);
    return NextResponse.json(
      { error: `${error.code ?? "DB"}: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
