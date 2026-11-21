import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "Липецкий котёл — новости и аналитика Липецка и области",
    description:
      "Новости, аналитика и расследования о Липецке и Липецкой области: бюджет, власть, суды, ЖКХ, экономика. Лента Telegram-канала @lippot обновляется на сайте автоматически.",
    icons: {
      icon: [
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    openGraph: {
      title: "Липецкий котёл",
      description: "Новости и аналитика Липецка и области — без лишнего шума",
      type: "website",
      locale: "ru_RU",
      siteName: "Липецкий котёл",
      images: [{ url: `${origin}/og-v3.jpg`, width: 1200, height: 630, alt: "Липецкий котёл — новости Липецка и области" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Липецкий котёл",
      description: "Новости и аналитика Липецка и области — без лишнего шума",
      images: [`${origin}/og-v3.jpg`],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0e1422",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
