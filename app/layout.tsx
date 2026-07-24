import type { Metadata } from "next";
import { Barlow_Condensed, Manrope } from "next/font/google";
import "../styles.css";
import "./app.css";

const displayFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const bodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Ossi – AI Sales Coach", template: "%s | Ossi" },
  description: "Personalisierte Voice-Coachings für professionelle B2B-Gespräche.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}
