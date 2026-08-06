import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./command.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "cefense.com";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-v4.png`;

  return {
    title: "Cefense — From attack to proven fix.",
    description: "Cefense turns observed attacks into repo-specific matches, reviewable fixes, and verified closure.",
    keywords: ["Cefense", "cybersecurity", "DevSecOps", "attack intelligence", "code security", "autonomous remediation"],
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      apple: "/favicon.svg",
    },
    openGraph: {
      title: "Cefense — From attack to proven fix.",
      description: "Connect code, see reachable risk, review the fix, and prove the path closed.",
      type: "website",
      images: [{ url: imageUrl, width: 1672, height: 941, alt: "Cefense maps a live attack signal through a codebase graph to verified change" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Cefense — From attack to proven fix.",
      description: "Connect code, see reachable risk, review the fix, and prove the path closed.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
