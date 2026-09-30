import * as path from 'path';

export function detectLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts': case '.tsx': return 'typescript';
    case '.js': case '.jsx': case '.mjs': case '.cjs': return 'javascript';
    case '.json': return 'json';
    case '.html': case '.htm': return 'html';
    case '.css': return 'css';
    case '.scss': return 'scss';
    case '.less': return 'less';
    case '.md': case '.markdown': return 'markdown';
    case '.py': return 'python';
    case '.go': return 'go';
    case '.rs': return 'rust';
    case '.java': return 'java';
    case '.kt': case '.kts': return 'kotlin';
    case '.c': case '.h': return 'c';
    case '.cpp': case '.cc': case '.cxx': case '.hpp': return 'cpp';
    case '.cs': return 'csharp';
    case '.php': return 'php';
    case '.rb': return 'ruby';
    case '.sh': case '.bash': case '.zsh': return 'shell';
    case '.yaml': case '.yml': return 'yaml';
    case '.xml': return 'xml';
    case '.sql': return 'sql';
    case '.swift': return 'swift';
    case '.lua': return 'lua';
    case '.dart': return 'dart';
    case '.vue': return 'html';
    default: return 'plaintext';
  }
}
