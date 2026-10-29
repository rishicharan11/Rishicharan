# Rishi Charn Portfolio — Design Direction

## Brief

Create a personal portfolio with the editorial pacing and project-first storytelling of the supplied reference, but with an original visual system. It needs to feel confident, experimental, and easy to scan rather than imitating any reference content or media.

## Experience structure

1. **Hero:** a brief positioning statement, availability signal, and a subtle kinetic blue orbit.
2. **Selected work:** a numbered editorial sequence with large, self-contained project scenes.
3. **About:** a direct point of view and concise capability set.
4. **Contact:** a clear, high-contrast invitation to start a project.

The desktop experience holds navigation at the top and uses a wide editorial canvas. On smaller screens, the information order stays intact while visual scenes become taller and type scales deliberately.

## Visual system

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#050505` | Primary background and text |
| Paper | `#F2F3F0` | Work section and light surfaces |
| Electric blue | `#1457FF` | Signature accent, CTA, and kinetic elements |
| Muted | `#A9AAA6` | Supporting copy |
| Display | Archivo | Bold, compact headline voice |
| Body | Space Grotesk | Modern, readable utility text |
| Accent serif | Georgia | Warm counterpoint for emphasis |

The palette follows a strict black/white/electric-blue approach. Blue appears only when hierarchy, interaction, or emphasis calls for it, keeping it high-impact.

## Reference-derived principles, reinterpreted

- Start with a human sentence rather than a generic title.
- Use a persistent, low-noise navigation system.
- Give each work item a distinctive visual world and a short narrative label.
- Let scroll structure provide the feeling of a journey without relying on opaque effects.
- Keep all information in the DOM reading order; visuals are decorative.

## Interaction and accessibility

- Keyboard-visible focus is retained for every interactive element.
- Navigation and contact controls meet usable touch sizes on mobile.
- Entry animation uses Intersection Observer, with no motion under `prefers-reduced-motion`.
- Decorative artwork is hidden from assistive technology; meaningful links have descriptive accessible names.
- Contrast is deliberately high on both dark and light surfaces.

## Implementation notes

The site is intentionally dependency-free: semantic HTML, CSS art, and a few lines of JavaScript. This keeps the Vercel deployment fast and avoids placeholder imagery or borrowed work samples. Replace the project titles, summaries, contact address, and social links in `index.html` when real portfolio details are ready.
