---
name: "Rishi Charan — portfolio"
description: "One-page portfolio for a product & UI/UX designer: flat electric blue and white with one coral accent, bold geometric shapes and type that stretches as you scroll. Built on the 8B Inertia template (MIT)."
colors:
  blue: "#232de4"
  white: "#ffffff"
  black: "#0a0a0a"
  coral: "#e26255"
  soft: "#eef0fd"
  cap: "#4a4f7a"
  cap-on-blue: "#c9ccff"
  quiet: "#7c82ee"
typography:
  display: { fontFamily: TikTok Sans, fontWeight: 300, lineHeight: 0.82, letterSpacing: -0.03em, axis: "wdth 75–150" }
  statement: { fontFamily: Geist, fontSize: "28–52px", fontWeight: 500 }
  section-title: { fontFamily: Geist, fontSize: "36–62px", fontWeight: 500 }
  card-title: { fontFamily: Geist, fontSize: 21px, fontWeight: 500 }
  body: { fontFamily: Geist, fontSize: 16px }
  small: { fontFamily: Geist, fontSize: 14px }
rounded: { card: 20px, pill: 999px }
---

# Rishi Charan — portfolio

A single static `index.html` (inline CSS and scripts, no build step, no animation libraries), adapted from the
8B "Inertia" template. Two fragments are spliced in by marker: `parts/shapes.html` at `<!-- PART:shapes -->`
(styles in `assets/shapes.css`) and `parts/footer.html` at `<!-- PART:footer -->` (`assets/labels.css`, `assets/labels.js`).

## Colour

Locomotive-style: big flat electric-blue fields with white type, white sections with blue type, 1px hairlines
(blue on white, `--hairline-on-blue` on blue). Coral is the only accent: dots, the starburst, the method playhead,
button streaks, link hovers and some shapes. No gradients, glows or shadows; no photos except the project shots.

Shared tokens in `:root`: `--blue --white --black --coral --soft --cap --cap-on-blue` (plus `--quiet`, `--hairline`,
`--hairline-on-blue`). The template's `--color-1…8` are remapped onto them: 1 white ground, 2 soft, 3 blue (text,
dark cards, bands, hairlines), 4 cap, 5 coral, 6 white, 7 quiet (large display text only, ~3.3:1), 8 cap-on-blue.
Small text uses `--cap` on white (7.8:1) and `--cap-on-blue` on blue (5.3:1). Never set small text in coral.

## Type

Geist 400/500 for everything; TikTok Sans 300 with the width axis for the hero name ("rishi charan", `--len:12`)
and the three project titles. Sentence case, tight negative tracking, no uppercase labels.

## Shapes

Flat CSS shapes sized by `font-size` (a 1em box) and coloured by `currentColor`, with `--hole` as the cut-out colour:
`.shp.shp-ring`, `.shp-donut`, `.shp-disc`, `.shp-squircle` (rounded diamond), `.shp-stadium` (pill with a slot)
and an inline-SVG sunburst of radiating bars. Statement pills (`.m-pill`, `.m-pill--blue`) and button streaks are
flat coral/blue stadiums.

## Sections (in order)

1. `#site-nav` — logo mark + name, Work / Services / Process / Contact, "Get in touch"; white over the hero, blue on a
   92% white bar once scrolled; hides on scroll down.
2. `#opening` — full-bleed blue hero (title, lead, "See the work" / "Get in touch", a "Latest: Hydr8" card, drifting
   ring, sunburst, coral donut and black donut, the name across the bottom), then a two-tone statement on white
   with the coral starburst.
3. `#practice` (Services) — four staggered cards (blue, black, blue, soft) dealt from a pile on scroll.
4. `#work` (Selected work) — three hairline rows: Closet, Hydr8, Pulse; titles stretch, shots open from a pill.
5. `#shapes` — fragment (marquee strip + blue band of parallax shapes).
6. `#method` (Process) — blue band; Research, Define, Design, Test & ship slide under a coral playhead on a sticky stage.
7. `#contact` — blue band, title words skid in, coral band grows; email placeholder, form (sends nothing yet),
   template credit.
8. `#footer` — fragment.

## Motion

Kept from the template: the `motion-gate` script sets `data-8b-live` only with scroll-driven animation support and no
reduced-motion preference; all scroll rules are scoped to it. The `motion` part provides **brake** (section titles),
**streak** and **drift**; the inline motion kit measures distances, adds `is-in`, splits the contact title into words,
pauses off-screen loops and smooths the wheel. Scenes: `opening-arrival`, `practice-deal` (4 cards),
`work-index` (3 rows), `method-timeline`, `contact-streak`. The hero shapes float on slow CSS loops and drift up with
a view-timeline parallax. Without scroll-driven animations or with reduced motion every section shows its finished layout.

## Rules

- Keep `id`, `data-8b-section`, `data-8b-motion`, `data-8b-items`, `--len` and the classes the scene CSS/scripts use
  (`.pr-card`, `.wk-row`, `.wk-title`, `.wk-shot`, `.mt-step`, `.mt-track`, `.ct-form`, `.ct-status`, `.nav__menu`, `.nav__close`).
- Adding a fourth work row or fifth service card needs matching nth-of-type rules in the scene CSS.
- Don't invent clients, metrics or testimonials. Placeholders: the email (`data-8b-placeholder="email"`) and the form.
- Keep the header comment, `<meta name="generator">` and the "Design: 8B" credit (MIT).
