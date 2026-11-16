import type { MetadataRoute } from "next";

/**
 * Manifesto de PWA, servido em /manifest.webmanifest.
 *
 * Existe principalmente por causa do push no iPhone e no iPad: o Safari só
 * oferece Web Push a sites adicionados à Tela de Início, e "abrir como app"
 * depende deste arquivo. Sem ele o formulário só dizia "não suportado".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GaiaSenses",
    short_name: "GaiaSenses",
    description: "Arte, som e clima em tempo real sobre o mapa.",
    start_url: "/pt/map3",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
