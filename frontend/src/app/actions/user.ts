"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createOrUpdateUser() {
  console.log("=== createOrUpdateUser called ===");

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

  console.log("Auth user:", user?.id);
  console.log("Auth error:", authError);

  if (authError || !user) {
    console.error("Error getting user:", authError);
    return { error: "Not authenticated" };
  }

  // Extract GitHub data from user metadata
  const githubId = user.user_metadata.provider_id;
  const githubUsername = user.user_metadata.user_name;
  const email = user.user_metadata.email; // Use GitHub email
  const avatarUrl = user.user_metadata.avatar_url;

  console.log("GitHub data:", { githubId, githubUsername, email });

  // Update Supabase auth email if it's different
  if (user.email !== email) {
    console.log("Updating Supabase auth email from", user.email, "to", email);
    const { error: updateError } = await supabase.auth.updateUser({
      email: email,
    });

    if (updateError) {
      console.error("Failed to update auth email:", updateError);
      // Don't fail the whole function, just log it
    }
  }

  // Check if user already exists in our database
  const { data: existingUser, error: fetchError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  console.log("Existing user:", existingUser?.id);
  console.log("Fetch error:", fetchError?.code);

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("Error fetching user:", fetchError);
    return { error: "Database error" };
  }

  if (existingUser) {
    // User exists - update their info in case anything changed
    console.log("Updating existing user");

    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({
        github_username: githubUsername,
        email: email,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating user:", updateError);
      return { error: "Failed to update user record" };
    }

    console.log("User updated successfully");
    return { user: updatedUser };
  }

  console.log("Creating new user...");

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

  console.log("New user created:", newUser?.id);
  console.log("Insert error:", insertError);

  if (insertError) {
    console.error("Error creating user:", insertError);
    return { error: "Failed to create user record", details: insertError };
  }

  console.log("=== User creation successful ===");
  return { user: newUser };
}
