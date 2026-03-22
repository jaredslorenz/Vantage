"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginButton() {
  const supabase = createClient();

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error("Error logging in:", error.message);
    }
  };

  return (
    <button
      onClick={handleLogin}
      className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
    >
      Sign in with GitHub
    </button>
  );
}
