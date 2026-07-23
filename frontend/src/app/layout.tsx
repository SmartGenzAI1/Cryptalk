import type { Metadata, Viewport } from "next";
import { ErrorBoundary } from '@/components/error-boundary'
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cryptalk — Secure Messenger",
  description: "Private by default. Fast by design. End-to-end encrypted messaging with no phone number required.",
  keywords: ["Cryptalk", "messenger", "chat", "secure", "encrypted", "private", "E2EE"],
  authors: [{ name: "Cryptalk" }],
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo-small.png", sizes: "64x64", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: undefined,
  openGraph: {
    title: "Cryptalk",
    description: "Secure real-time messaging",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Cryptalk",
    description: "Secure real-time messaging",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#10b981" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1419" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <link rel="preload" href="/logo.png" as="image" type="image/png" fetchPriority="high" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster />
          <SonnerToaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
