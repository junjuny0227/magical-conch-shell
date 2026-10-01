import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ConchFallback from './ConchFallback';
import ConchScene from './ConchScene';

describe('고리 자체 접근성', () => {
  it('Canvas가 별도 버튼 없이 고리 이름과 키보드 역할을 제공한다', () => {
    const markup = renderToStaticMarkup(createElement(ConchScene));
    expect(markup).toContain('role="button"');
    expect(markup).toContain('aria-label="소라고동 고리 당기기"');
    expect(markup).not.toContain('<button');
  });
  it('SVG의 실제 고리에 키보드 포커스를 제공한다', () => {
    const markup = renderToStaticMarkup(createElement(ConchFallback));
    expect(markup).toContain('role="button"');
    expect(markup).toContain('aria-label="소라고동 고리 당기기"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).not.toContain('옆의 버튼');
  });
  it('비활성화된 SVG 고리를 포커스 순서에서 제외한다', () => {
    const markup = renderToStaticMarkup(createElement(ConchFallback, { disabled: true }));
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('tabindex="-1"');
  });
});
