"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import LoginButton from "@/components/LoginButton";
import { createOrUpdateUser } from "./actions/user";
import type { User } from "@supabase/supabase-js";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Check if user is logged in
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // User is logged in - make sure they exist in our database
        const result = await createOrUpdateUser();

        if (result.error) {
          console.error("Error creating user:", result.error);
        } else {
          console.log("User record ready:", result.user);
        }
      }

      setUser(user);
      setLoading(false);
    };

    checkUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);

      if (session?.user) {
        // User just logged in - create/update their record
        await createOrUpdateUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">Vantage</h1>

        {user ? (
          <div className="space-y-4">
            <p className="text-lg text-gray-700">
              Welcome,{" "}
              <span className="font-semibold">
                {user.user_metadata.user_name}
              </span>
              !
            </p>
            <div className="flex items-center justify-center gap-4">
              {user.user_metadata.avatar_url && (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Avatar"
                  className="w-12 h-12 rounded-full"
                />
              )}
              <div className="text-left text-sm text-gray-600">
                <p>{user.email}</p>
                <p>GitHub: @{user.user_metadata.user_name}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600 mb-6">
              Monitor your CI/CD builds with AI-powered insights
            </p>
            <LoginButton />
          </div>
        )}
      </div>
    </div>
  );
}
