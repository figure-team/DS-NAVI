import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/public/**',
      '**/coverage/**',
      '**/.understand-anything/**',
      '**/.claude-plugin/**',
      '**/.cursor-plugin/**',
      '**/.copilot-plugin/**',
      '**/.astro/**',
      '.private/**',
      // 라우트 추출 테스트 픽스처 — 의도적으로 미사용 인자/any를 포함하는 샘플 코드
      '**/fixtures/**',
      // 벤더링된 분석 대상 예제 소스(jpetstore·egovframe 등) — 우리 코드가 아님
      'examples/**',
      // 병렬 워크트리 체크아웃 — 각자 자기 루트에서 린트하므로 메인 리포에서는 제외
      '.claude/worktrees/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'no-irregular-whitespace': ['error', { skipComments: true }],
    },
  },
  {
    files: ['understand-anything-plugin/packages/dashboard/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // 기존 코드가 의도적 deps 생략을 disable 주석으로 관리 중 — 경고 수준으로 계도.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.mjs', '**/__tests__/**/*.{ts,tsx,mjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Claude Code Workflow 스크립트 — 러너가 주입하는 오케스트레이션 전역
    files: ['**/*.workflow.js'],
    languageOptions: {
      globals: {
        agent: 'readonly',
        parallel: 'readonly',
        pipeline: 'readonly',
        phase: 'readonly',
        log: 'readonly',
        args: 'readonly',
        budget: 'readonly',
        workflow: 'readonly',
      },
    },
  },
);
