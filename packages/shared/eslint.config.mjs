import { nodeTypeScriptConfig } from '@veris/config/eslint';

export default nodeTypeScriptConfig({
  tsconfigRootDir: import.meta.dirname,
  decimalSafeFiles: ['src/**/*.ts'],
});
