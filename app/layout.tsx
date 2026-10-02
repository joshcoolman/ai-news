import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import { Toast } from "@/components/actions/Toast";
import "./globals.css";

const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto" });
const mono = Roboto_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-roboto-mono" });

export const metadata: Metadata = { title: "AI News" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${roboto.variable} ${mono.variable}`}>
      <body>
        {children}
        <Toast />
      </body>
    </html>
  );
}
