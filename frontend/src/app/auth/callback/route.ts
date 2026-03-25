import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createOrUpdateUser } from "@/app/actions/user";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`);
  }

  const supabase = await createServerSupabaseClient();
  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

  if (sessionError) {
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  const result = await createOrUpdateUser();

  if (result.error) {
    return NextResponse.redirect(`${origin}/?error=user_setup_failed`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
