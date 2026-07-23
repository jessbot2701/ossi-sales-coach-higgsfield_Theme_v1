/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import "../styles.css";
import "./app.css";

export const metadata: Metadata = {
  title: { default: "Ossi – AI Sales Coach", template: "%s | Ossi" },
  description: "Personalisierte Voice-Coachings für professionelle B2B-Gespräche.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="site-grain" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
