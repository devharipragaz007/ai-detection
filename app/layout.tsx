import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Detector — Sentence-Level Analysis",
  description:
    "Detect AI-generated text with sentence-level highlighting, plain-English explanations, and one-click humanization.",
  openGraph: {
    title: "AI Detector — Sentence-Level Analysis",
    description:
      "Detect AI-generated text with sentence-level highlighting and humanization.",
    url: "https://ai-detection-blond.vercel.app",
    siteName: "AI Detector",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
