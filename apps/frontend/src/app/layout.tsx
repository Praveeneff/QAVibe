import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
