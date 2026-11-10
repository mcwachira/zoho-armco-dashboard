# Design system

The interface uses layered charcoal surfaces, fine neutral borders, compact typography and restrained semantic color. Green means confirmed/healthy, amber means pending or attention required, red means failure, and neutral means inactive or unknown. The palette and shared layout tokens are in `src/styles.css`.

## Primitives

The shared button primitive in `src/components/ui/button.tsx` uses class-variance-authority and the `cn` utility configured for shadcn/ui-style component aliases. Global search and notification components live under `src/components/layout/`. The current route views also share `PageHeading`, `Panel`, `Stat`, `Badge`, `ServiceList`, `SubmissionTable`, `DetailDrawer`, `CopyField`, and queue/event rows in `src/app/App.tsx`. Icons use Lucide, charts use Recharts, and Framer Motion is limited to drawers and small global overlays. Sonner handles interaction feedback.

## Interaction and accessibility

Controls have visible keyboard focus, labels, semantic navigation, responsive filters and mobile navigation. Tables scroll horizontally on compact screens. Reduced-motion preferences are respected. Status color is always accompanied by text.
