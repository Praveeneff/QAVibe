import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
import { PermissionsProvider } from "@/context/PermissionsContext";
import Nav from "../components/Nav";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quality Vibe — AI-Powered QA Management",
  description:
    "Quality Vibe is an AI-powered QA management platform for modern engineering teams. Generate, organise, and run test cases with built-in AI assistance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AuthProvider>
          <PermissionsProvider>
            <Nav />
            {children}
          </PermissionsProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
