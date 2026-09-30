import { describe, expect, it } from 'vitest';

import { cn } from '@/shared/lib';

describe('테스트 실행 기반', () => {
  it('프로젝트 별칭을 해석하고 기존 클래스 병합을 실행한다', () => {
    expect(cn('p-2', 'p-4', false && 'hidden')).toBe('p-4');
  });
});
