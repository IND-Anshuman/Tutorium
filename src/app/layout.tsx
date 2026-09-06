import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tutorium — say less, learn more",
  description: "Voice-first AI tutor: speak your question, get an interactive lesson.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}