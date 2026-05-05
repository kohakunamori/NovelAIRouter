import type { Metadata } from "next"
import localFont from "next/font/local"

import "./globals.css"

const sourceSans = localFont({
  src: [
    { path: "../../public/fonts/novelai/source-sans-pro-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/novelai/source-sans-pro-600.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/novelai/source-sans-pro-700.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/novelai/source-sans-pro-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-source-sans",
  display: "swap",
})

const eczar = localFont({
  src: [
    { path: "../../public/fonts/novelai/eczar-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/novelai/eczar-600.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/novelai/eczar-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-eczar",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://novelai.net"),
  title: "Image Generation",
  description:
    "NovelAI is the #1 AI image generator tool for generating AI anime art and crafting epic stories with our storytelling models.",
  icons: {
    icon: "/seo/novelai/novelai-round.png",
    apple: "/seo/novelai/novelai-square.png",
    other: [{ rel: "mask-icon", url: "/seo/novelai/pen-tip-light.svg" }],
  },
  openGraph: {
    title: "NovelAI - AI Anime Image Generator & Storyteller",
    description:
      "NovelAI is the #1 AI image generator tool for generating AI anime art and crafting epic stories with our storytelling models.",
    images: [{ url: "/seo/novelai/social.png", width: 1200, height: 630 }],
    siteName: "NovelAI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@novelaiofficial",
    site: "@novelaiofficial",
    title: "NovelAI - AI Anime Image Generator & Storyteller",
    description:
      "NovelAI is the #1 AI image generator tool for generating AI anime art and crafting epic stories with our storytelling models.",
    images: ["/seo/novelai/social.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${eczar.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full overflow-hidden">{children}</body>
    </html>
  )
}
