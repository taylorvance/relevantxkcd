import defineReactAppConfig from '@taylorvance/tv-shared-dev/eslint/react-app';

export default [
  ...defineReactAppConfig({
    extraIgnores: ['raw_data/**', 'processed_data/**'],
  }),
];
