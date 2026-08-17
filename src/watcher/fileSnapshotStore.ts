/**
 * fileSnapshotStore.ts
 *
 * Quản lý snapshot nội dung các file trong workspace để
 * WorkspaceWatcher có thể phát hiện external writes so với baseline.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isExcludedPathSegment } from './pathExclusions';
import { exceedsLineLimit, exceedsSizeLimitByBytes } from './fileSizeLimit';

export class FileSnapshotStore {
  /** filePath -> nội dung baseline trước khi external process ghi đè */
  private snapshots = new Map<string, string>();
  /**
   * Các file bị bỏ qua vì vượt giới hạn kích thước.
   *
   * Cần nhớ riêng, vì "không có baseline" một mình là mơ hồ: nó vừa có nghĩa
   * file mới toanh, vừa có nghĩa file cũ nhưng từng bị bỏ qua. Phân biệt sai thì
   * WorkspaceWatcher sẽ gắn `fileExistedBefore = false`, và khi đó Revert all
   * sẽ XOÁ file thay vì khôi phục nội dung.
   */
  private sizeSkipped = new Set<string>();

  private normalizePath(p: string): string {
    const fsPath = vscode.Uri.file(path.resolve(p)).fsPath;
    return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
  }

  get(filePath: string): string | undefined {
    return this.snapshots.get(this.normalizePath(filePath));
  }

  set(filePath: string, content: string): void {
    this.snapshots.set(this.normalizePath(filePath), content);
  }

  has(filePath: string): boolean {
    return this.snapshots.has(this.normalizePath(filePath));
  }

  /** Bỏ theo dõi 1 file vì nó vượt giới hạn kích thước. */
  markSizeSkipped(filePath: string): void {
    const key = this.normalizePath(filePath);
    this.snapshots.delete(key);
    this.sizeSkipped.add(key);
  }

  /**
   * File này từng bị bỏ qua vì kích thước? Dùng để phân biệt "file mới" với
   * "file cũ vừa lọt xuống dưới ngưỡng". Trả về true thì đồng thời xoá cờ, vì
   * caller sẽ dựng lại baseline ngay sau đó.
   */
  consumeSizeSkipped(filePath: string): boolean {
    const key = this.normalizePath(filePath);
    return this.sizeSkipped.delete(key);
  }

  /** Xoá toàn bộ baseline trong RAM. Dùng khi branch switch để rebuild lại từ disk. */
  clear(): void {
    this.snapshots.clear();
    this.sizeSkipped.clear();
  }

  /**
   * Đệ quy snapshot nội dung tất cả file text trong một thư mục.
   * Chỉ chạy lần đầu khi extension khởi động để tạo baseline.
   */
  buildInitialSnapshots(folderPath: string): void {
    try {
      this.snapshotDir(folderPath, 0);
    } catch {
      // ignore lỗi permission hoặc thư mục không có quyền đọc
    }
  }

  private snapshotDir(dirPath: string, depth: number): void {
    if (depth > 5) { return; } // giới hạn độ sâu để tránh tràn stack
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('.')) {
        continue;
      }
      const fullPath = path.resolve(dirPath, entry.name);
      if (isExcludedPathSegment(fullPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        this.snapshotDir(fullPath, depth + 1);
      } else if (entry.isFile() && isTextFile(entry.name)) {
        try {
          // Lọc thô theo byte trước, để file vài MB không bị đọc lên chỉ để loại.
          if (exceedsSizeLimitByBytes(fs.statSync(fullPath).size)) {
            this.markSizeSkipped(fullPath);
            continue;
          }
          const content = fs.readFileSync(fullPath, 'utf8');
          if (exceedsLineLimit(content)) {
            this.markSizeSkipped(fullPath);
            continue;
          }
          this.snapshots.set(this.normalizePath(fullPath), content);
        } catch {
          // binary hoặc file đang bị lock — bỏ qua
        }
      }
    }
  }
}


type FileDetectionMode = 'defaultAndCustom' | 'customOnly';

interface TextFileRules {
  extensions: Set<string>;
  filenames: Set<string>;
  filenamePatterns: RegExp[];
}

const DEFAULT_TEXT_EXTS = new Set([
  '.agent.md', '.astro', '.ascx', '.asp', '.aspx', '.atom', '.axaml', '.axml',
  '.bash', '.bash_aliases', '.bash_login', '.bash_logout', '.bash_profile', '.bashrc',
  '.bat', '.bbx', '.bib', '.bpmn', '.brs',
  '.c', '.c++', '.c++m', '.cake', '.cbx', '.cc', '.ccm', '.cfg', '.cginc',
  '.chatmode.md', '.cjs', '.clj', '.cljc', '.cljs', '.cljx', '.clojure',
  '.cmake', '.cmd', '.code-profile', '.code-search', '.code-snippets',
  '.code-workspace', '.coffee', '.conf', '.containerfile', '.copilotmd',
  '.cpp', '.cppm', '.cs', '.csh', '.cshrc', '.cshtml', '.cson', '.css',
  '.css.map', '.csx', '.cts', '.cu', '.cuh', '.cxx', '.cxxm',
  '.dart', '.diff', '.directory', '.dita', '.ditamap', '.dsql', '.dtd', '.dtml',
  '.ebuild', '.eclass', '.edn', '.ejs', '.ent', '.erb', '.es6', '.eslintrc',
  '.eslintrc.json', '.eyaml', '.eyml',
  '.fish', '.fs', '.fsi', '.fsproj', '.fsscript', '.fsx', '.fxml', '.fx', '.fxh',
  '.geojson', '.git-blame-ignore-revs', '.gitattributes', '.gitconfig',
  '.gitignore', '.gitignore_global', '.gitmodules', '.go', '.gradle',
  '.gradle.kts', '.groovy', '.gvy', '.gyp', '.gypi',
  '.h', '.h++', '.h.in', '.handlebars', '.har', '.hbs', '.hh', '.hintrc',
  '.hjs', '.hlsl', '.hlsli', '.hpp', '.hpp.in', '.htm', '.html', '.hxx',
  '.i', '.iced', '.iml', '.ini', '.ino', '.inl', '.instructions.md', '.ipy',
  '.ipp', '.ipynb', '.isml', '.ixx',
  '.j2', '.jade', '.java', '.jav', '.jl', '.jmd', '.jenkinsfile', '.jinja2',
  '.jmx', '.js', '.js.map', '.jsfmtrc', '.jshintrc', '.jshtm', '.jslintrc',
  '.json', '.jsonc', '.jsonl', '.jsonld', '.jsp', '.jsx',
  '.ksh',
  '.launch', '.less', '.litcoffee', '.log', '.ltx', '.lua',
  '.m', '.mak', '.markdown', '.markdn', '.md', '.mdoc', '.mdown', '.mdtext',
  '.mdtxt', '.mk', '.mkd', '.mkdn', '.mjs', '.mm', '.mod', '.mts', '.mxml',
  '.ndjson', '.nf', '.nqp', '.npmignore', '.npmrc', '.nuspec',
  '.opml', '.owl',
  '.p6', '.pac', '.patch', '.php', '.php4', '.php5', '.phtml', '.pl', '.pl6',
  '.pm', '.pm6', '.pod', '.podspec', '.profile', '.proj', '.prompt.md',
  '.properties', '.props', '.ps1', '.psd1', '.psgi', '.psh', '.psm1',
  '.psrc', '.pssc', '.pt', '.pubxml', '.pubxml.user', '.publishsettings',
  '.pug', '.py', '.pyi', '.pyt', '.pyw',
  '.r', '.rake', '.raku', '.rakudoc', '.rakumod', '.rakutest', '.razor',
  '.rb', '.rbi', '.rbx', '.rbxlx', '.rbxmx', '.rdf', '.rej', '.repo',
  '.rhtml', '.rjs', '.rng', '.ron', '.ronn', '.rprofile', '.rpy', '.rs', '.rst',
  '.rt', '.ru',
  '.sass', '.scss', '.shader', '.sh', '.shproj', '.shtml', '.slnx', '.sql',
  '.storyboard', '.sty', '.svg', '.svelte', '.swift', '.swcrc',
  '.t', '.targets', '.tcshrc', '.tex', '.tld', '.tmx', '.toml', '.tpp', '.ts',
  '.ts.map', '.tsbuildinfo', '.tsx', '.txx', '.txt',
  '.vba', '.vb', '.vbs', '.vbproj', '.vbproj.user', '.vcxproj',
  '.vcxproj.filters', '.volt', '.vue',
  '.wat', '.webmanifest', '.winget', '.workbook', '.wsdl', '.wxi', '.wxl',
  '.wxs',
  '.xaml', '.xbl', '.xht', '.xhtml', '.xib', '.xlf', '.xliff', '.xml',
  '.xoml', '.xpdl', '.xprofile', '.xsession', '.xsessionrc', '.xsl', '.xslt',
  '.xsd', '.xul',
  '.yaml', '.yaml-tmlanguage', '.yaml-tmpreferences', '.yaml-tmtheme',
  '.yash_profile', '.yashrc', '.yml',
  '.zlogin', '.zlogout', '.zprofile', '.zsh', '.zsh-theme', '.zshenv', '.zshrc',
]);

const DEFAULT_TEXT_FILENAMES = new Set([
  '.babelrc', '.condarc', '.containerignore', '.devcontainer-internal.json',
  '.dockerignore', '.editorconfig', '.env', '.envrc', '.flake8', '.flaskenv',
  '.git-blame-ignore-revs', '.gitattributes', '.gitconfig', '.gitignore',
  '.gitignore_global', '.gitmodules', '.hushlogin', '.jscsrc', '.jshintrc',
  '.npmignore', '.npmrc', '.pep8', '.pylintrc', '.pypirc', '.vuerc',
  'apkbuild', 'cmakecache.txt', 'cmakelists.txt', 'containerfile',
  'constraints.txt', 'devcontainer-feature.json', 'dockerfile', 'gnumakefile',
  'jenkinsfile', 'makefile', 'ocamlmakefile', 'pipfile', 'pipfile.lock',
  'pkgbuild', 'poetry.lock', 'requirements.in', 'requirements.txt', 'uv.lock',
  'user-dirs.dirs',
]);

const DEFAULT_TEXT_FILENAME_PATTERNS = [
  /^.*\.containerfile$/i,
  /^.*\.dockerignore$/i,
  /^.*\.dockerfile$/i,
  /^.*constraints.*\.txt$/i,
  /^.*requirements.*\.(txt|in)$/i,
  /^containerfile\..*$/i,
  /^dockerfile\..*$/i,
  /^jenkinsfile.*$/i,
  /^.*\.env\..*$/i,
  /^.*\.log\..*$/i,
];

let textFileRules: TextFileRules | undefined;

/**
 * Kiểm tra xem file có phải là text file không dựa trên extension, filename và pattern.
 */
export function isTextFile(filename: string): boolean {
  if (!textFileRules) {
    refreshTextFileRules();
  }
  const lowerName = path.basename(filename).toLowerCase();
  if (textFileRules!.filenames.has(lowerName)) { return true; }
  if (textFileRules!.filenamePatterns.some(pattern => pattern.test(lowerName))) { return true; }
  return Array.from(textFileRules!.extensions).some(ext => lowerName.endsWith(ext));
}

export function refreshTextFileRules(): void {
  const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
  const mode = config.get<FileDetectionMode>('supportedFileDetectionMode', 'defaultAndCustom');
  const customExts = normalizeExtensions(config.get<string[]>('supportedFileExtensions', []));
  const customFilenames = normalizeStrings(config.get<string[]>('supportedFilenames', []));
  const customPatterns = compileGlobPatterns(config.get<string[]>('supportedFilenamePatterns', []));

  textFileRules = {
    extensions: mode === 'customOnly'
      ? customExts
      : new Set([...DEFAULT_TEXT_EXTS, ...customExts]),
    filenames: mode === 'customOnly'
      ? customFilenames
      : new Set([...DEFAULT_TEXT_FILENAMES, ...customFilenames]),
    filenamePatterns: mode === 'customOnly'
      ? customPatterns
      : [...DEFAULT_TEXT_FILENAME_PATTERNS, ...customPatterns],
  };
}

function normalizeExtensions(values: string[]): Set<string> {
  const normalized = new Set<string>();
  for (const value of values) {
    const ext = value.trim().toLowerCase();
    if (!ext) { continue; }
    normalized.add(ext.startsWith('.') ? ext : `.${ext}`);
  }
  return normalized;
}

function normalizeStrings(values: string[]): Set<string> {
  const normalized = new Set<string>();
  for (const value of values) {
    const item = value.trim().toLowerCase();
    if (item) {
      normalized.add(item);
    }
  }
  return normalized;
}

function compileGlobPatterns(values: string[]): RegExp[] {
  const patterns: RegExp[] = [];
  for (const value of values) {
    const pattern = value.trim().toLowerCase();
    if (!pattern) { continue; }
    patterns.push(globToRegExp(pattern));
  }
  return patterns;
}

function globToRegExp(pattern: string): RegExp {
  let source = '^';
  for (const ch of pattern) {
    if (ch === '*') {
      source += '.*';
    } else if (ch === '?') {
      source += '.';
    } else {
      source += escapeRegExp(ch);
    }
  }
  return new RegExp(`${source}$`, 'i');
}

function escapeRegExp(ch: string): string {
  return /[\\^$+?.()|[\]{}]/.test(ch) ? `\\${ch}` : ch;
}
