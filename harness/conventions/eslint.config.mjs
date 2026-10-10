// The lint rules for the TypeScript arm of Experiment 5: the recommended typescript-eslint set,
// nothing custom, which is what a typical team ships. The experiment tool points eslint at this file.

import tseslint from 'typescript-eslint';

export default tseslint.config(...tseslint.configs.recommended, { ignores: ['**/attempt-*/**', '**/node_modules/**'] });
