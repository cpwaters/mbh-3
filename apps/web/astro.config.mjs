import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Static output. Landing/legal/docs are pure Astro (zero JS); the driver app
// is one React island hydrated at its own route. Tailwind (v4, via the Vite
// plugin) is the styling system, matching the design from the prototype.
export default defineConfig({
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
