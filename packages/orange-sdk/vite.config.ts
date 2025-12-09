// vite.config.ts
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/guide/build.html#library-mode
export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'contracts/index': resolve(__dirname, 'src/contracts/index.ts'),
      },
      name: 'OrangeSDK',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // Externalize deps that shouldn't be bundled
      external: ['algosdk', '@algorandfoundation/algokit-utils', 'axios'],
      output: {
        // Provide global variables for UMD build
        globals: {
          algosdk: 'algosdk',
          '@algorandfoundation/algokit-utils': 'AlgoKitUtils',
          axios: 'axios',
        },
      },
    },
    // Generate sourcemaps for debugging
    sourcemap: true,
    // Ensure clean output
    emptyOutDir: true,
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  // Ensure compatibility with both Node and browser
  resolve: {
    conditions: ['import', 'module', 'browser', 'default'],
  },
});