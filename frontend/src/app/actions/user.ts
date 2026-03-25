"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createOrUpdateUser() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated" };
  }

  const rawGithubId = user.user_metadata.provider_id;
  const githubId = parseInt(rawGithubId);

  if (!rawGithubId || isNaN(githubId)) {
    return { error: "Invalid GitHub account data" };
  }

  const githubUsername = user.user_metadata.user_name;
  const email = user.user_metadata.email ?? user.email;
  const avatarUrl = user.user_metadata.avatar_url;

  // upsert handles both new and returning users atomically, avoiding race conditions.
  // plan and usage_this_month are excluded so they are never overwritten on login —
  // those columns must have DB defaults (plan: 'free', usage_this_month: 0).
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        id: user.id,
        github_id: githubId,
        github_username: githubUsername,
        email: email,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error) {
    return { error: "Failed to save user record" };
  }

  return { user: data };
}
