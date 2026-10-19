import * as path from 'path';

export type PreviewKind = 'code' | 'markdown' | 'image' | 'csv' | 'mermaid';

const KIND_BY_EXTENSION: Record<string, PreviewKind> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.ico': 'image',
  '.svg': 'image',
  '.csv': 'csv',
  '.tsv': 'csv',
  '.mmd': 'mermaid',
  '.mermaid': 'mermaid',
};

/** Extensions whose image bytes are not text, so they must not go through openTextDocument. */
const BINARY_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico']);

export function getPreviewKind(filePath: string): PreviewKind {
  return KIND_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'code';
}

export function isBinaryImage(filePath: string): boolean {
  return BINARY_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
