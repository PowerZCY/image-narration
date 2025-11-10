import React from 'react';

// Default tag renderers mirror the behavior of @windrun-huaiin/third-ui.
const defaultTagRenderers = {
  strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
  em: (chunks: React.ReactNode) => <em>{chunks}</em>,
  u: (chunks: React.ReactNode) => <u>{chunks}</u>,
  mark: (chunks: React.ReactNode) => (
    <mark className="bg-purple-300 dark:bg-purple-500 text-neutral-800 dark:text-neutral-300 px-1 rounded">
      {chunks}
    </mark>
  ),
  del: (chunks: React.ReactNode) => <del>{chunks}</del>,
  sub: (chunks: React.ReactNode) => <sub>{chunks}</sub>,
  sup: (chunks: React.ReactNode) => <sup>{chunks}</sup>,
};

type TagRenderer = (chunks: React.ReactNode) => React.ReactElement;
type TagRenderers = Record<string, TagRenderer>;

export function createRichTextRenderer(customRenderers?: TagRenderers) {
  const renderers = { ...defaultTagRenderers, ...customRenderers };

  return function richText(t: any, key: string) {
    return t.rich(key, renderers);
  };
}

export const richText = createRichTextRenderer();
