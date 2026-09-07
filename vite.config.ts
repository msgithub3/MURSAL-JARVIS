import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, type ServerOptions, type PreviewOptions } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Heavy directories, build outputs, caches, and non-frontend assets ignored during
 * file system watching. Prevents inotify descriptor exhaustion and high CPU polling
 * in containerized environments.
 */
const WATCH_IGNORED_PATTERNS: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/.temp/**',
  '**/.tmp/**',
  '**/jarvis_core/__pycache__/**',
  '**/*.pyc',
  '**/.dev.*',
  '**/tests/**',
  '**/*.log',
  '**/*.sqlite*',
  '**/.system_generated/**',
  '**/.aistudio/**',
];

export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production' || process.env.NODE_ENV === 'production' || command === 'build';
  const isHmrDisabled = process.env.DISABLE_HMR === 'true';

  // ---------------------------------------------------------------------------
  // 1. Development Server Configuration
  // ---------------------------------------------------------------------------
  const devServerConfig: ServerOptions = {
    // Robust 0.0.0.0 host binding for container ingress, Cloud Run, and Nginx reverse proxy
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    cors: true,
    // Permit reverse-proxy host forwarding (Nginx, Cloud Run, internal dev domains)
    allowedHosts: true as const,

    // HMR configuration: unified with Express server on port 3000
    hmr: {
      overlay: false,
    },

    // Fine-tuned file watcher: completely disabled when HMR is off to save CPU/inotify handles;
    // otherwise strictly ignores heavy directories like node_modules and build outputs.
    watch: isHmrDisabled
      ? null
      : {
          usePolling: process.env.VITE_USE_POLLING === 'true',
          interval: 1000,
          binaryInterval: 3000,
          ignored: WATCH_IGNORED_PATTERNS,
        },
  };

  // ---------------------------------------------------------------------------
  // 2. Production Preview Server Configuration (Strictly Separated)
  // ---------------------------------------------------------------------------
  const previewServerConfig: PreviewOptions = {
    // Robust 0.0.0.0 host binding for production preview
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    cors: true,
    allowedHosts: true as const,
  };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@/src': path.resolve(rootDir, 'src'),
        '@': path.resolve(rootDir, 'src'),
        '~': path.resolve(rootDir, '.'),
      },
    },
    // Strictly separated server configurations
    server: devServerConfig,
    preview: previewServerConfig,
  };
});
