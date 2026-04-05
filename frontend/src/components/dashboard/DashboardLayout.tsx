"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { MorphingBackground } from "@/components/landing/Morphingbackground";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-brand flex relative overflow-hidden">
      <MorphingBackground />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div
        className="flex flex-col min-w-0 transition-all duration-300"
        style={{ width: `calc(100% - ${collapsed ? "5rem" : "13.75rem"})` }}
      >
        <Header user={user} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
