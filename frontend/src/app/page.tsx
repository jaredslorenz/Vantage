import { MorphingBackground } from "@/components/landing/Morphingbackground";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Integrations } from "@/components/landing/Integrations";
import { CTA } from "@/components/landing/Cta";

export default function Home() {
  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <MorphingBackground />
      <Nav />
      <Hero />
      <Features />
      <Integrations />
      <CTA />
    </div>
  );
}
