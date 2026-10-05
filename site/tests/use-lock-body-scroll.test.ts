import { afterEach, describe, expect, it } from 'vitest';

import {
  __lockBodyScrollForTests,
  __resetLockBodyScrollForTests,
  __unlockBodyScrollForTests,
} from '../app/_lib/use-lock-body-scroll';

function stubDocument() {
  const body = { style: {} as Record<string, string> };
  const documentElement = { style: {} as Record<string, string>, clientWidth: 1024 };
  Object.assign(globalThis, {
    document: { body, documentElement },
    window: {
      innerWidth: 1024,
      addEventListener() {},
      removeEventListener() {},
    },
  });
  return { body, documentElement };
}

describe('body scroll lock', () => {
  afterEach(() => {
    __resetLockBodyScrollForTests();
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('locks html and body and restores them after the last unlock', () => {
    const { body, documentElement } = stubDocument();
    __lockBodyScrollForTests();
    expect(body.style.overflow).toBe('hidden');
    expect(documentElement.style.overflow).toBe('hidden');
    expect(body.style.overscrollBehavior).toBe('none');
    __lockBodyScrollForTests();
    __unlockBodyScrollForTests();
    expect(body.style.overflow).toBe('hidden');
    __unlockBodyScrollForTests();
    expect(body.style.overflow).toBe('');
    expect(documentElement.style.overflow).toBe('');
  });
});
