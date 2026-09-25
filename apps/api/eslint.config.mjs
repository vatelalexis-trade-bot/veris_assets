import { nodeTypeScriptConfig } from '@virtus/config/eslint';

export default nodeTypeScriptConfig({
  tsconfigRootDir: import.meta.dirname,
  decimalSafeFiles: ['src/modules/**/*.ts'],
});
