# Helix · brand assets v2

> Generated from the locked v2 brand system. Cyan eléctrico `#00E5D4` sobre obsidian `#0A0E14`. Standalone marca, no sub-marca de huevsite.

---

## Estructura

```
helix-brand-assets/
├── svg/         ← editables, usar siempre que se pueda
└── png/         ← rasterizados, listos para uso
```

Siempre **preferí SVG** sobre PNG. Los SVGs no pierden calidad, pesan ~700 bytes cada uno, y se editan en cualquier editor. PNG solo cuando la plataforma no soporta SVG (Twitter, algunos clientes de email, app stores).

---

## Inventario por uso

### Para el sitio web

| Archivo                                        | Uso                                            |
| ---------------------------------------------- | ---------------------------------------------- |
| `lockup-horizontal-transparent-light@2x.png`   | Logo en footer / fondo claro                   |
| `lockup-horizontal-transparent-dark@2x.png`    | Logo en navbar de la app                       |
| `og-image.png`                                 | OG image para Twitter / WhatsApp / LinkedIn    |
| `favicon-solid-32.png`                         | Favicon — pegar en `app/icon.png` (Next.js)    |
| `favicon-solid-180.png`                        | Apple touch icon                               |

### Para el deck del pitch (mañana)

| Archivo                                        | Uso                                            |
| ---------------------------------------------- | ---------------------------------------------- |
| `lockup-horizontal-dark@2x.png`                | Slide 1 (hook), esquina superior izq.          |
| `symbol-on-dark@2x.png`                        | Slide 3 (ask), grande centrado                 |
| `og-image.png`                                 | Slide thumbnail si compartís el deck           |

### Para GitHub / GitHub App

| Archivo                                        | Uso                                            |
| ---------------------------------------------- | ---------------------------------------------- |
| `favicon-solid-512.png`                        | Avatar de la GitHub App + organization avatar  |
| `app-icon-1024.png`                            | App listing en GitHub Marketplace              |

### Para redes sociales

| Archivo                                        | Uso                                            |
| ---------------------------------------------- | ---------------------------------------------- |
| `favicon-solid-512.png`                        | Avatar circular de Twitter / X / LinkedIn      |
| `og-image.png`                                 | Banner / portada                               |

---

## Variantes del símbolo · cuándo usar cada una

**1 · Símbolo "outline" (3 ondas, transparente)**
Archivo: `symbol-on-dark.svg` / `symbol-on-light.svg`
Uso: cuando ya hay contexto de marca y querés algo sutil. Headers, navbar, watermarks.

**2 · Símbolo sólido cyan (2 ondas, fondo cyan, ondas obsidian)**
Archivo: `favicon-solid-*.png`
Uso: avatares, iconos de app, favicon, badges. Cuando necesitás máxima legibilidad o pegada visual.

**3 · Símbolo 4 ondas (hero, agrandado)**
Archivo: `symbol-4wave-on-dark.svg`
Uso: hero de la landing, posters, splash screens. Solo para tamaños ≥200px.

---

## Reglas de uso (resumen)

- El cyan `#00E5D4` es el ÚNICO acento. Si dudás, no lo uses.
- Sobre obsidian `#0A0E14`: ondas alternadas cyan + blanco
- Sobre claro: ondas alternadas cyan + obsidian
- Mínimo 16px de altura para cualquier variante
- Padding mínimo alrededor del logo: la altura de una onda completa
- Nunca rotes, distorsiones, agregues sombras, gradientes o efectos al logo

---

## Cómo subir a Google Drive

Como Claude no puede subir directamente a tu Drive, hacelo manual:

1. Descargá el ZIP `helix-brand-assets.zip`
2. Descomprimilo en tu compu
3. Subí toda la carpeta `helix-brand-assets/` al Drive donde tengas el resto de Helix
4. Compartila como solo-lectura con el equipo de la hackathon
5. Anotá el link en el README del repo de Helix

---

## Archivos ZIP

`helix-brand-assets.zip` — todo el bundle (SVG + PNG en todas las resoluciones)
`helix-pngs-only.zip` — solo PNGs, si vas a subir solo eso al Drive
