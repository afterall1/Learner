import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/__tests__/**/*.test.ts'],
        exclude: ['node_modules', '.next'],
        coverage: {
            reporter: ['text', 'text-summary'],
            include: ['src/lib/risk/**', 'src/lib/engine/cortex.ts'],
        },
    },
});
