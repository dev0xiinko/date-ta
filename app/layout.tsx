import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk, Space_Mono } from "next/font/google";
import SwRegister from "@/app/sw-register";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  weight: ["400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Bai Spots",
  description: "curated cebu low-key spots ni bro",
  applicationName: "Bai Spots",
  appleWebApp: {
    capable: true,
    title: "Bai Spots",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // firm, app-like — no pinch-zoom or input auto-zoom
  viewportFit: "cover", // run under the notch / home indicator
  themeColor: "#0c0a0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${hanken.variable} ${spaceMono.variable} antialiased`}
    >
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
