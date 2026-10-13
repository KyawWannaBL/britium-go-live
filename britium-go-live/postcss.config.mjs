export default {
  plugins: {
    tailwindcss: { config: './tailwind.config.cjs' },
    autoprefixer: { overrideBrowserslist: ['Chrome >= 80'] },
  },
};
