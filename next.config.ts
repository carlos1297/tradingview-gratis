import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Reescribe los imports de barril (`import { Zap } from "lucide-react"`)
     * a la ruta del icono concreto.
     *
     * `lucide-react` son 40 MB y ~4000 iconos en un solo índice. Sin esto, en
     * desarrollo cada archivo que importa un icono arrastra el barril entero:
     * el primer compilado y cada recarga en caliente pagan miles de módulos
     * para usar seis. No cambia una línea de código ni el resultado en
     * producción (ahí el tree-shaking ya los eliminaba); lo que mejora es el
     * arranque del dev server y el HMR.
     */
    optimizePackageImports: ["lucide-react"],

    /**
     * Mete el CSS en el HTML como <style> en vez de un <link> aparte.
     *
     * Ahorra un round-trip bloqueante antes del primer pintado. Este visor
     * arranca en negro hasta que llega la hoja de estilos, así que se nota en
     * el arranque.
     */
    inlineCss: true,
  },
};

export default nextConfig;
