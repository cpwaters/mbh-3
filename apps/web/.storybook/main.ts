import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  // The app styles via @tailwindcss/vite; Storybook's Vite needs the same
  // plugin so the utility classes render.
  async viteFinal(cfg) {
    const tailwindcss = (await import('@tailwindcss/vite')).default;
    cfg.plugins = cfg.plugins ?? [];
    cfg.plugins.push(tailwindcss());
    return cfg;
  },
};

export default config;
