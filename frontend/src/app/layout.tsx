import type { Metadata, Viewport } from "next";
import { ErrorBoundary } from '@/components/error-boundary'
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { SWRegister } from "@/components/sw-register";
import { InstallPrompt } from "@/components/install-prompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cryptalk-three.vercel.app"),
  title: {
    default: "Cryptalk — Secure Encrypted Messenger",
    template: "%s | Cryptalk",
  },
  description:
    "Private by default. Fast by design. End-to-end encrypted messaging with no phone number required. Voice & video calls, group chats, file sharing — all E2EE.",
  keywords: [
    "Cryptalk",
    "encrypted messenger",
    "secure chat",
    "E2EE",
    "end-to-end encryption",
    "private messaging",
    "secure messenger app",
    "encrypted chat",
    "privacy",
    "PWA messenger",
  ],
  authors: [{ name: "Cryptalk Team" }],
  creator: "Cryptalk",
  publisher: "Cryptalk",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo-small.png", sizes: "64x64", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Cryptalk — Secure Encrypted Messenger",
    description:
      "Private by default. Fast by design. End-to-end encrypted messaging, voice & video calls, and file sharing — no phone number required.",
    url: "https://cryptalk-three.vercel.app",
    siteName: "Cryptalk",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Cryptalk — End-to-End Encrypted Messenger",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cryptalk — Secure Encrypted Messenger",
    description:
      "Private by default. Fast by design. E2EE messaging, calls, and file sharing — no phone number required.",
    images: ["/og-image.png"],
    creator: "@cryptalk",
  },
  alternates: {
    canonical: "https://cryptalk-three.vercel.app",
  },
  category: "technology",
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
        <meta name="theme-color" content="#10b981" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Cryptalk" />
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
          <SWRegister />
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
