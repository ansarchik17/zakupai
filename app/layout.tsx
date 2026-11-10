import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZakupAI — совместные закупки",
  description:
    "Заказы, оплаты и выкуп в одном рабочем пространстве организатора.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
