import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
import { PermissionsProvider } from "@/context/PermissionsContext";
import Nav from "../components/Nav";

export const metadata: Metadata = {
  title: "QAVibe",
  description: "QAVibe App",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#111", color: "#eee", fontFamily: "sans-serif" }}>
        <AuthProvider>
          <PermissionsProvider>
            <Nav />
            {children}
          </PermissionsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
