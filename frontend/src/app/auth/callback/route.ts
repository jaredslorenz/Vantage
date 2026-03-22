import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createOrUpdateUser } from "@/app/actions/user";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Success - create/update user record
      const result = await createOrUpdateUser();

      if (result.error) {
        console.error("Error creating user:", result.error);
      } else {
        console.log("User created/updated:", result.user?.id);
      }

      // Redirect to dashboard
      return NextResponse.redirect(`${origin}/dashboard`);
    } else {
      // Log error and redirect to home
      console.error("Auth callback error:", error);
    }
  }

  // No code or error occurred - redirect to home
  return NextResponse.redirect(`${origin}/`);
}
