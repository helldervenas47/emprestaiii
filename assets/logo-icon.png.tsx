import React from "react";

/**
 * assets/logo-icon.png.tsx
 *
 * Este projeto referencia "@/assets/logo-icon.png" como se fosse um asset de imagem,
 * mas o bundler deste sandbox não resolve arquivos binários .png diretamente.
 * Para manter o import funcionando (import logo from "@/assets/logo-icon.png"),
 * exportamos aqui uma Data URI (SVG codificado em base64) como default export,
 * que pode ser usada em qualquer lugar que espere uma "src" de imagem
 * (ex.: <img src={logoIcon} />).
 *
 * Design: ícone minimalista em tema escuro/indigo, coerente com a identidade
 * "tech premium" do produto (EmprestAI) — um "E" estilizado dentro de um
 * quadrado arredondado com leve gradiente indigo sobre fundo zinc-950.
 */

const svgMarkup = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Logo">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="256" height="256" rx="56" fill="url(#bgGrad)" />
  <rect x="1.5" y="1.5" width="253" height="253" rx="54.5" fill="none" stroke="#27272a" stroke-width="3" />

  <g transform="translate(64,64)">
    <rect x="0" y="0" width="128" height="128" rx="24" fill="none" />
    <path
      d="M14 8 H100 A6 6 0 0 1 106 14 V26 A6 6 0 0 1 100 32 H32 V56 H84 A6 6 0 0 1 90 62 V74 A6 6 0 0 1 84 80 H32 V104 H100 A6 6 0 0 1 106 110 V122 A6 6 0 0 1 100 128 H14 A6 6 0 0 1 8 122 V14 A6 6 0 0 1 14 8 Z"
      fill="url(#accentGrad)"
    />
    <circle cx="104" cy="20" r="5" fill="#a5b4fc" />
  </g>
</svg>
`.trim();

function toBase64Utf8(input: string): string {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    // Garante suporte a caracteres fora do intervalo Latin1
    return window.btoa(unescape(encodeURIComponent(input)));
  }
  // Fallback (ambientes sem window, ex.: SSR/teste)
  return Buffer.from(input, "utf-8").toString("base64");
}

const logoIconDataUri = `data:image/svg+xml;base64,${toBase64Utf8(svgMarkup)}`;

export default logoIconDataUri;

/** Componente auxiliar opcional, caso algum arquivo prefira renderizar via JSX. */
export function LogoIcon({
  size = 32,
  className,
  alt = "Logo",
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={logoIconDataUri}
      alt={alt}
      width={size}
      height={size}
      className={className}
      loading="lazy"
    />
  );
}