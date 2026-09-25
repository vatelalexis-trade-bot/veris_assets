import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Removes what each test rendered, so that tests never see each other's output.
afterEach(() => {
  cleanup();
});
