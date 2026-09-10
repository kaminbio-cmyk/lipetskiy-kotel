import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "Липецкий котёл — новости Липецка и области",
    description: "Новости, аналитика и события Липецка и Липецкой области. Лента канала @lippot — с контекстом и без лишнего шума.",
    openGraph: {
      title: "Липецкий котёл",
      description: "Новости без лишнего шума",
      type: "website",
      locale: "ru_RU",
      images: [{ url: `${origin}/og-v2.png`, width: 1734, height: 908, alt: "Липецкий котёл — новости без лишнего шума" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Липецкий котёл",
      description: "Новости без лишнего шума",
      images: [`${origin}/og-v2.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
