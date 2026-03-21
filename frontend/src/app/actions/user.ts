"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createOrUpdateUser() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignore if called from Server Component
          }
        },
      },
    },
  );

  // Get the authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error("Error getting user:", authError);
    return { error: "Not authenticated" };
  }

  // Extract GitHub data from user metadata
  const githubId = user.user_metadata.provider_id;
  const githubUsername = user.user_metadata.user_name;
  const email = user.email;
  const avatarUrl = user.user_metadata.avatar_url;

  // Check if user already exists in our database
  const { data: existingUser, error: fetchError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    // PGRST116 = not found, which is okay
    console.error("Error fetching user:", fetchError);
    return { error: "Database error" };
  }

  if (existingUser) {
    // User exists, just return it
    return { user: existingUser };
  }

  // User doesn't exist, create new record
  const { data: newUser, error: insertError } = await supabase
    .from("users")
    .insert({
      id: user.id,
      github_id: parseInt(githubId),
      github_username: githubUsername,
      email: email,
      avatar_url: avatarUrl,
      plan: "free",
      usage_this_month: 0,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Error creating user:", insertError);
    return { error: "Failed to create user record" };
  }

  return { user: newUser };
}
