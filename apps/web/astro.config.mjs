import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Static output. Landing/legal/docs are pure Astro (zero JS); the driver app
// is one React island hydrated at its own route.
export default defineConfig({
  output: 'static',
  integrations: [react()],
});
