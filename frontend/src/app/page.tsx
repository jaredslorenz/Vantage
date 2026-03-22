"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import LoginButton from "@/components/LoginButton";
import { createOrUpdateUser } from "./actions/user";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // User is logged in - create/update their record
        const result = await createOrUpdateUser();

        if (result.error) {
          console.error("Error creating user:", result.error);
        } else {
          console.log("User record ready:", result.user);
        }

        // Redirect to dashboard
        router.push("/dashboard");
      } else {
        // Not logged in - show landing page
        setLoading(false);
      }
    };

    checkUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        // User just logged in - create/update their record then redirect
        await createOrUpdateUser();
        router.push("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-brand">
        <p className="text-white/80">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-brand">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Vantage</h1>
        <p className="text-white/80 mb-8">
          Monitor your full stack in one place
        </p>
        <LoginButton />
      </div>
    </div>
  );
}
