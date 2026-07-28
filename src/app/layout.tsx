import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TradingView Gratis — Crypto charts open source",
  description:
    "Plataforma de charts crypto en vivo. Alternativa gratis a TradingView. Construida sobre la Charting Library oficial de TradingView + datos de Binance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-tv-bg text-tv-text">
        {/* El monitoreo en vivo de los modelos vive en BarraModelosIA (dentro
            de la página): un solo sondeo para todas las fuentes del registro,
            en vez de un badge flotante por motor. */}
        <TooltipProvider delay={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
