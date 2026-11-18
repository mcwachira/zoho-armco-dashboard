import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'
export default defineConfig(
  {
    ignores: [
      'dist',
      'node_modules',
      '.npm-cache',
      '.pnpm-store',
      '.pnpm-local-profile',
      '.browser-validation-*/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
