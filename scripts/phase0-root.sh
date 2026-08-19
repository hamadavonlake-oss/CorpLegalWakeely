#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/home/z/my-project/global-legal-operations"

echo "=== Phase 0: Root Config Files ==="

# ── Root package.json ──
cat > "$PROJECT_ROOT/package.json" << 'ROOTPKG'
{
  "name": "global-legal-operations",
  "version": "0.1.0",
  "private": true,
  "description": "Global Legal Operations Platform - MVP",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev:api": "turbo run dev --filter=@glo/api",
    "dev:web": "turbo run dev --filter=@glo/web",
    "dev": "turbo run dev",
    "build": "turbo run build",
    "build:api": "turbo run build --filter=@glo/api",
    "build:web": "turbo run build --filter=@glo/web",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e",
    "db:generate": "prisma generate --schema=prisma/schema.prisma",
    "db:migrate": "prisma migrate dev --schema=prisma/schema.prisma",
    "db:push": "prisma db push --schema=prisma/schema.prisma",
    "db:seed": "tsx prisma/seed/index.ts",
    "db:studio": "prisma studio --schema=prisma/schema.prisma"
  },
  "devDependencies": {
    "turbo": "^2.4.4",
    "typescript": "^5.7.3",
    "prettier": "^3.5.3",
    "eslint": "^9.22.0",
    "@typescript-eslint/eslint-plugin": "^8.26.1",
    "@typescript-eslint/parser": "^8.26.1",
    "eslint-config-prettier": "^10.1.1"
  },
  "packageManager": "npm@11.16.0",
  "engines": {
    "node": ">=20.0.0"
  }
}
ROOTPKG
echo "[OK] Root package.json"

# ── turbo.json ──
cat > "$PROJECT_ROOT/turbo.json" << 'TURBO'
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:e2e": {
      "dependsOn": ["build"]
    },
    "db:generate": {
      "cache": false
    }
  }
}
TURBO
echo "[OK] turbo.json"

# ── tsconfig.base.json ──
cat > "$PROJECT_ROOT/tsconfig.base.json" << 'TSBASE'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false
  },
  "exclude": ["node_modules", "dist", ".next"]
}
TSBASE
echo "[OK] tsconfig.base.json"

# ── Prettier ──
cat > "$PROJECT_ROOT/.prettierrc" << 'PRETTY'
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
PRETTY

cat > "$PROJECT_ROOT/.prettierignore" << 'PIGNORE'
node_modules
dist
.next
.turbo
coverage
*.min.js
*.min.css
package-lock.json
PIGNORE
echo "[OK] Prettier config"

# ── ESLint flat config ──
cat > "$PROJECT_ROOT/eslint.config.mjs" << 'ESLINT'
import eslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': eslint,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
    },
  },
  prettierConfig,
];
ESLINT
echo "[OK] ESLint config"

# ── .gitignore ──
cat > "$PROJECT_ROOT/.gitignore" << 'GITG'
node_modules/
dist/
.next/
.turbo/
coverage/
*.tsbuildinfo
.env
.env.local
.env.*.local
!.env.example
*.log
npm-debug.log*
.DS_Store
Thumbs.db
*.swp
*.swo
*~
.idea/
.vscode/
.prisma/client/
uploads/
tmp/
GITG
echo "[OK] .gitignore"

# ── .npmrc ──
cat > "$PROJECT_ROOT/.npmrc" << 'NPMRC'
shamefully-hoist=true
strict-peer-dependencies=false
NPMRC
echo "[OK] .npmrc"

echo "=== Root config files done ==="
