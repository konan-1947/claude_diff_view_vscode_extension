/**
 * fileTypeRules.ts
 *
 * Quy tắc xác định file nào được coi là text/reviewable.
 */

import * as path from 'path';
import * as vscode from 'vscode';

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
  '.gitignore', '.gitignore_global', '.gitmodules', '.go', '.gradle', '.gradle.kts',
  '.groovy', '.gvy', '.gyp', '.gypi',
  '.h', '.h++', '.h.in', '.handlebars', '.har', '.hbs', '.hh', '.hintrc',
  '.hjs',
  '.hlsl', '.hlsli', '.hpp', '.hpp.in', '.htm', '.html', '.hxx',
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

/** Kiểm tra xem file có phải là text file không dựa trên extension, filename và pattern. */
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
