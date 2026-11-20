/**
 * FileSystem Service
 * File operation wrappers + file search
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { execFile, ExecFileException } from 'child_process';
import Fuse from 'fuse.js';
import { createDecorator } from '../di/instantiation';

/**
 * Whether an error is an ExecFileException
 */
function isExecException(error: unknown): error is ExecFileException {
	return error instanceof Error && ('code' in error || 'signal' in error);
}

export const IFileSystemService = createDecorator<IFileSystemService>('fileSystemService');

/**
 * File search result item
 */
export interface FileSearchResult {
	path: string;      // relative path
	name: string;      // file name
	type: 'file' | 'directory';
}

/**
 * Ripgrep execution result
 */
interface RipgrepResult {
	absolute: string;  // absolute path
	relative: string;  // relative path
}

export interface IFileSystemService {
	readonly _serviceBrand: undefined;

	readFile(uri: vscode.Uri): Thenable<Uint8Array>;
	writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
	delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Thenable<void>;
	rename(source: vscode.Uri, target: vscode.Uri, options?: { overwrite?: boolean }): Thenable<void>;
	createDirectory(uri: vscode.Uri): Thenable<void>;
	readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]>;
	stat(uri: vscode.Uri): Thenable<vscode.FileStat>;

	/**
	 * List files with Ripgrep (no search, returns the raw list)
	 * @param cwd working directory
	 * @returns array of file paths (relative)
	 */
	listFilesWithRipgrep(cwd: string): Promise<string[]>;

	/**
	 * Search files (full pipeline: Ripgrep + directory extraction + Fuse.js)
	 * @param pattern search pattern
	 * @param cwd working directory
	 * @returns array of file search results
	 */
	searchFiles(pattern: string, cwd: string): Promise<FileSearchResult[]>;

	/**
	 * Search files with the VS Code API (Ripgrep fallback)
	 * @param pattern search pattern
	 * @param cwd working directory
	 * @returns array of file search results
	 */
	searchFilesWithWorkspace(pattern: string, cwd: string): Promise<FileSearchResult[]>;

	/**
	 * Extract all parent directories from a list of file paths (matches the official implementation)
	 * @param filePaths array of file paths (relative)
	 * @returns deduplicated directory paths (relative, with a trailing /)
	 */
	extractParentDirectories(filePaths: string[]): string[];

	/**
	 * Get the top-level workspace directories (for an empty query)
	 * @param cwd working directory
	 * @returns array of top-level directories
	 */
	getTopLevelDirectories(cwd: string): Promise<FileSearchResult[]>;

	/**
	 * Normalize to an absolute path
	 * @param filePath file path (absolute or relative)
	 * @param cwd working directory
	 * @returns normalized absolute path
	 */
	normalizeAbsolutePath(filePath: string, cwd: string): string;

	/**
	 * Convert to a workspace-relative path
	 * @param absolutePath absolute path
	 * @param cwd working directory
	 * @returns relative path
	 */
	toWorkspaceRelative(absolutePath: string, cwd: string): string;

	/**
	 * Resolve a file path (supports ~ expansion and relative paths)
	 * @param filePath file path
	 * @param cwd working directory
	 * @returns normalized absolute path
	 */
	resolveFilePath(filePath: string, cwd: string): string;

	/**
	 * Check whether a path exists
	 * @param target target path
	 * @returns whether it exists
	 */
	pathExists(target: string): Promise<boolean>;

  /**
   * Check whether a file is executable
   * @param target target path
   * @returns whether it is executable
   */
  isExecutable(target: string): Promise<boolean>;

	/**
	 * Sanitize a file name (remove illegal characters)
	 * @param fileName original file name
	 * @returns sanitized file name
	 */
	sanitizeFileName(fileName: string): string;

	/**
	 * Create a temporary file
	 * @param fileName file name
	 * @param content file content
	 * @returns temporary file path
	 */
	createTempFile(fileName: string, content: string): Promise<string>;

	/**
	 * Resolve and find an existing path (with fuzzy search)
	 * @param filePath file path
	 * @param cwd working directory
	 * @param searchResults optional search results (if given, fuzzy matching is used)
	 * @returns existing absolute path
	 */
	resolveExistingPath(filePath: string, cwd: string, searchResults?: FileSearchResult[]): Promise<string>;

	/**
	 * Find files (full business logic)
	 * - An empty query returns top-level content (directories + top-level files)
	 * - A non-empty query: Ripgrep + directory extraction + Fuse.js
	 * - Falls back to the VS Code API automatically
	 * @param pattern search pattern (optional; an empty query returns top-level content)
	 * @param cwd working directory
	 * @returns array of file search results
	 */
	findFiles(pattern: string | undefined, cwd: string): Promise<FileSearchResult[]>;
}

export class FileSystemService implements IFileSystemService {
	readonly _serviceBrand: undefined;

	// Ripgrep command cache
	private ripgrepCommandCache: { command: string; args: string[] } | null = null;

	// ===== Basic file operations =====

	readFile(uri: vscode.Uri): Thenable<Uint8Array> {
		return vscode.workspace.fs.readFile(uri);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void> {
		return vscode.workspace.fs.writeFile(uri, content);
	}

	delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Thenable<void> {
		return vscode.workspace.fs.delete(uri, options);
	}

	rename(source: vscode.Uri, target: vscode.Uri, options?: { overwrite?: boolean }): Thenable<void> {
		return vscode.workspace.fs.rename(source, target, options);
	}

	createDirectory(uri: vscode.Uri): Thenable<void> {
		return vscode.workspace.fs.createDirectory(uri);
	}

	readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]> {
		return vscode.workspace.fs.readDirectory(uri);
	}

	stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
		return vscode.workspace.fs.stat(uri);
	}

	// ===== File search (fully matches the official implementation) =====

	/**
	 * List all files with Ripgrep (no search, returns the raw list)
	 */
	async listFilesWithRipgrep(cwd: string): Promise<string[]> {
		// 1. Build the ripgrep arguments
		const args = ['--files', '--follow', '--hidden'];

		// 2. Add exclusion rules
		const excludeGlobs = this.buildExcludePatterns();
		for (const glob of excludeGlobs) {
			args.push('--glob', `!${glob}`);
		}

		// 3. Run ripgrep and return the raw file path list
		const rawPaths = await this.execRipgrep(args, cwd);

		// 4. Convert to relative paths
		return rawPaths.map(rawPath => {
			const absolute = this.normalizeAbsolutePath(rawPath.replace(/^\.\//, ''), cwd);
			return this.toWorkspaceRelative(absolute, cwd);
		});
	}

	/**
	 * Search files (full pipeline: matches the official implementation)
	 * 1. Ripgrep lists all files
	 * 2. Extract parent directories
	 * 3. Merge [directories, files]
	 * 4. Fuse.js fuzzy search over the whole list
	 */
	async searchFiles(pattern: string, cwd: string): Promise<FileSearchResult[]> {
		// 1. Get the file list with Ripgrep
		const files = await this.listFilesWithRipgrep(cwd);

		// 2. Extract all parent directories (with a trailing /)
		const directories = this.extractParentDirectories(files);

		// 3. Merge: [directories first, files after]
		const allPaths = [...directories, ...files];

		// 4. Fuse.js search over the whole list (matches official)
		return this.fuseSearchPaths(allPaths, pattern);
	}

	/**
	 * Search files with the VS Code API (fallback)
	 */
	async searchFilesWithWorkspace(pattern: string, cwd: string): Promise<FileSearchResult[]> {
		const include = pattern.includes('*') || pattern.includes('?')
			? pattern
			: `**/*${pattern}*`;

		// Build exclusion patterns automatically
		const excludePatterns = this.buildExcludePatterns();
		const excludeGlob = this.toExcludeGlob(excludePatterns);

		const uris = await vscode.workspace.findFiles(include, excludeGlob, 100);

		return uris.map(uri => {
			const fsPath = uri.fsPath;
			const relative = this.toWorkspaceRelative(fsPath, cwd);
			return {
				path: relative,
				name: path.basename(fsPath),
				type: 'file' as const  // VS Code findFiles only returns files too
			};
		});
	}

	/**
	 * Extract all parent directories from a list of file paths (fully matches the official implementation)
	 */
	extractParentDirectories(filePaths: string[]): string[] {
		const dirSet = new Set<string>();

		filePaths.forEach(filePath => {
			let current = path.dirname(filePath);

			// Walk upwards, adding every parent directory
			while (current !== '.' && current !== path.parse(current).root) {
				dirSet.add(current);
				current = path.dirname(current);
			}
		});

		// Return the directory list with a trailing / marking directories
		return Array.from(dirSet).map(dir => dir + path.sep);
	}

	/**
	 * Get the top-level workspace directories (for an empty query)
	 */
	async getTopLevelDirectories(cwd: string): Promise<FileSearchResult[]> {
		const workspaceUri = vscode.Uri.file(cwd);

		try {
			const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
			const results: FileSearchResult[] = [];

			for (const [name, type] of entries) {
				if (type === vscode.FileType.Directory) {
					results.push({
						path: name,
						name: name,
						type: 'directory'
					});
				}
			}

			return results.sort((a, b) => a.name.localeCompare(b.name));
		} catch {
			return [];
		}
	}

	/**
	 * Get the top-level workspace content (directories + top-level files, for an empty query)
	 */
	async getTopLevelContents(cwd: string): Promise<FileSearchResult[]> {
		try {
			const files = await this.listFilesWithRipgrep(cwd);
			const directories = this.extractParentDirectories(files);
			const allPaths = [...directories, ...files];

			return this.extractTopLevelItems(allPaths);

		} catch (error) {
			// Ripgrep failed, fall back to the VS Code API
			console.warn('[FileSystemService] Ripgrep failed in getTopLevelContents, falling back to readDirectory:', error);

			try {
				const workspaceUri = vscode.Uri.file(cwd);
				const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
				const results: FileSearchResult[] = [];

				for (const [name, type] of entries) {
					if (type === vscode.FileType.Directory) {
						results.push({ path: name, name: name, type: 'directory' });
					} else if (type === vscode.FileType.File) {
						results.push({ path: name, name: name, type: 'file' });
					}
				}

				return results.sort((a, b) => {
					if (a.type === 'directory' && b.type === 'file') return -1;
					if (a.type === 'file' && b.type === 'directory') return 1;
					return a.name.localeCompare(b.name);
				});
			} catch (fallbackError) {
				console.error('[FileSystemService] getTopLevelContents fallback also failed:', fallbackError);
				return [];
			}
		}
	}

	/**
	 * Extract top-level items
	 * Takes the first path segment of every path and determines whether it is a directory
	 */
	extractTopLevelItems(allPaths: string[]): FileSearchResult[] {
		const topLevelSet = new Set<string>();
		const maxItems = 200;

		for (const filePath of allPaths) {
			const firstLevel = filePath.split(path.sep)[0];
			if (firstLevel) {
				topLevelSet.add(firstLevel);
				if (topLevelSet.size >= maxItems) break;
			}
		}

		return Array.from(topLevelSet).sort().map(topLevel => {
			const hasChildren = allPaths.some(p => p.startsWith(topLevel + path.sep));

			return {
				path: hasChildren ? topLevel + path.sep : topLevel,
				name: path.basename(topLevel),
				type: hasChildren ? 'directory' as const : 'file' as const
			};
		});
	}

	// ===== Private helpers =====

	/**
	 * Run a Ripgrep command (matches the official implementation)
	 */
	private execRipgrep(args: string[], cwd: string): Promise<string[]> {
		const { command, args: defaultArgs } = this.getRipgrepCommand();

		return new Promise((resolve, reject) => {
			execFile(command, [...defaultArgs, ...args], {
				cwd,
				maxBuffer: 20 * 1024 * 1024,  // 20MB (matches official)
				timeout: 10_000                // 10 seconds (matches official)
			}, (error, stdout) => {
				// No error, return normally
				if (!error) {
					resolve(stdout.split(/\r?\n/).filter(Boolean));
					return;
				}

				// Use a type guard to access error properties safely
				if (isExecException(error)) {
					// code === 1 means no matches, not an error
					if (error.code === 1) {
						resolve([]);
						return;
					}

					// Timed out or buffer overflowed, but there are partial results
					const hasOutput = stdout && stdout.trim().length > 0;
					if ((error.signal === 'SIGTERM' || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') && hasOutput) {
						const lines = stdout.split(/\r?\n/).filter(Boolean);
						// Drop the possibly incomplete last line
						resolve(lines.length > 0 ? lines.slice(0, -1) : []);
						return;
					}
				}

				reject(error);
			});
		});
	}

	/**
	 * Get the Ripgrep command path (matches the official implementation, skips system detection)
	 */
	private getRipgrepCommand(): { command: string; args: string[] } {
		if (this.ripgrepCommandCache) {
			return this.ripgrepCommandCache;
		}

		// Use the extension's bundled ripgrep directly (skip system detection)
		const rootDir = path.resolve(__dirname, '..', '..', '..');
		const vendorDir = path.join(rootDir, 'vendor', 'ripgrep');

		let command: string;
		if (process.platform === 'win32') {
			command = path.join(vendorDir, 'x64-win32', 'rg.exe');
		} else {
			const platformKey = `${process.arch}-${process.platform}`;
			command = path.join(vendorDir, platformKey, 'rg');
		}

		// If the bundled ripgrep is missing, fall back to the system ripgrep
		try {
			require('fs').accessSync(command, require('fs').constants.X_OK);
		} catch {
			command = 'rg';
		}

		this.ripgrepCommandCache = { command, args: [] };
		return this.ripgrepCommandCache;
	}

	/**
	 * Search a path list with Fuse.js (fully matches the official implementation)
	 * @param paths path list (relative, directories with a trailing /)
	 * @param pattern search pattern
	 * @returns search results
	 */
	private fuseSearchPaths(paths: string[], pattern: string): FileSearchResult[] {
		// 1. Prepare data items
		const items = paths.map(filePath => {
			const isDirectory = filePath.endsWith(path.sep);
			const cleanPath = isDirectory ? filePath.slice(0, -1) : filePath;

			return {
				path: filePath,
				filename: path.basename(cleanPath),
				testPenalty: cleanPath.includes('test') || cleanPath.includes('spec') ? 1 : 0,
				isDirectory
			};
		});

		// 2. If the query contains a path separator, keep only items with the same parent directory
		const lastSep = pattern.lastIndexOf(path.sep);
		let filteredItems = items;

		if (lastSep > 2) {
			const dirPrefix = pattern.substring(0, lastSep);
			filteredItems = items.filter(item =>
				item.path.substring(0, lastSep).startsWith(dirPrefix)
			);
		}

		// 3. Fuzzy search with Fuse.js (fully matches the official config)
		const fuse = new Fuse(filteredItems, {
			includeScore: true,
			threshold: 0.5,
			keys: [
				{ name: 'path', weight: 1 },
				{ name: 'filename', weight: 2 }  // file name weighs more
			]
		});

		const results = fuse.search(pattern, { limit: 100 });

		// 4. Secondary sort: by score when the difference > 0.05, otherwise test files go last
		const sorted = results.sort((a, b) => {
			const scoreA = a.score ?? 0;
			const scoreB = b.score ?? 0;

			if (Math.abs(scoreA - scoreB) > 0.05) {
				return scoreA - scoreB;
			}
			return a.item.testPenalty - b.item.testPenalty;
		});

		// 5. Convert to the result format (limit 100)
		return sorted.slice(0, 100).map(r => {
			const cleanPath = r.item.isDirectory ? r.item.path.slice(0, -1) : r.item.path;

			return {
				path: cleanPath,
				name: r.item.filename,
				type: r.item.isDirectory ? 'directory' : 'file'
			};
		});
	}

	/**
	 * Normalize an absolute path (public, used by handlers)
	 */
	normalizeAbsolutePath(filePath: string, cwd: string): string {
		return path.isAbsolute(filePath)
			? path.normalize(filePath)
			: path.normalize(path.join(cwd, filePath));
	}

	/**
	 * Convert to a workspace-relative path (public, used by handlers)
	 */
	toWorkspaceRelative(absolutePath: string, cwd: string): string {
		const normalized = path.normalize(absolutePath);
		const normalizedCwd = path.normalize(cwd);

		if (normalized.startsWith(normalizedCwd)) {
			return normalized.substring(normalizedCwd.length + 1);
		}

		return normalized;
	}

	/**
	 * Resolve a file path (supports ~ expansion and relative paths)
	 */
	resolveFilePath(filePath: string, cwd: string): string {
		if (!filePath) {
			return cwd;
		}

		// Expand ~ to the user's home directory
		const expanded = filePath.startsWith('~')
			? path.join(require('os').homedir(), filePath.slice(1))
			: filePath;

		// Make absolute
		const absolute = path.isAbsolute(expanded)
			? expanded
			: path.join(cwd, expanded);

		return path.normalize(absolute);
	}

  /**
   * Check whether a file is executable
   * @param target target path
   * @returns whether it is executable
   */
  async isExecutable(target: string): Promise<boolean> {
    try {
      await require('fs').promises.access(target, require('fs').constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

	/**
	 * Check whether a path exists
	 */
	async pathExists(target: string): Promise<boolean> {
		try {
			await require('fs').promises.access(target, require('fs').constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Sanitize a file name (remove illegal characters)
	 */
	sanitizeFileName(fileName: string): string {
		const fallback = fileName && fileName.trim() ? fileName.trim() : 'claude.txt';
		return fallback.replace(/[<>:"\\/|?*\x00-\x1F]/g, '_');
	}

	/**
	 * Create a temporary file
	 */
	async createTempFile(fileName: string, content: string): Promise<string> {
		const tempDir = await require('fs').promises.mkdtemp(
			path.join(require('os').tmpdir(), 'claude-')
		);
		const sanitized = this.sanitizeFileName(fileName);
		const filePath = path.join(tempDir, sanitized);
		await require('fs').promises.writeFile(filePath, content, 'utf8');
		return filePath;
	}

	/**
	 * Resolve and find an existing path (with fuzzy search)
	 */
	async resolveExistingPath(filePath: string, cwd: string, searchResults?: FileSearchResult[]): Promise<string> {
		// 1. Try resolving the path directly
		const absoluteCandidate = this.resolveFilePath(filePath, cwd);
		if (await this.pathExists(absoluteCandidate)) {
			return absoluteCandidate;
		}

		// 2. If search results were given, use the first match
		if (searchResults && searchResults.length > 0) {
			const candidate = searchResults[0].path;
			const absolute = this.resolveFilePath(candidate, cwd);
			if (await this.pathExists(absolute)) {
				return absolute;
			}
		}

		// 3. Return the original candidate path (even if it does not exist)
		return absoluteCandidate;
	}

	/**
	 * Find files (full business logic)
	 */
	async findFiles(pattern: string | undefined, cwd: string): Promise<FileSearchResult[]> {
		// An empty query returns top-level content (directories + top-level files)
		if (!pattern || !pattern.trim()) {
			return await this.getTopLevelContents(cwd);
		}

		// Other patterns use the full search pipeline (Ripgrep + directory extraction + Fuse.js)
		try {
			return await this.searchFiles(pattern, cwd);
		} catch (error) {
			// Ripgrep failed, fall back to the VS Code API
			console.warn(`[FileSystemService] Ripgrep search failed, falling back to VSCode API:`, error);

			try {
				return await this.searchFilesWithWorkspace(pattern, cwd);
			} catch (fallbackError) {
				console.error(`[FileSystemService] Fallback search also failed:`, fallbackError);
				return [];
			}
		}
	}

	/**
	 * Build the exclusion pattern array (read from VS Code config and .gitignore)
	 * Private, used internally by searchFilesWithRipgrep
	 */
	private buildExcludePatterns(): string[] {
		const patterns = new Set<string>([
			'**/node_modules/**',
			'**/.git/**',
			'**/dist/**',
			'**/build/**',
			'**/.next/**',
			'**/.nuxt/**',
			'**/.DS_Store',
			'**/Thumbs.db',
			'**/*.log',
			'**/.env',
			'**/.env.*'
		]);

		try {
			const searchConfig = vscode.workspace.getConfiguration('search');
			const filesConfig = vscode.workspace.getConfiguration('files');
			const searchExclude = searchConfig.get<Record<string, boolean>>('exclude') ?? {};
			const filesExclude = filesConfig.get<Record<string, boolean>>('exclude') ?? {};

			for (const [glob, enabled] of Object.entries(searchExclude)) {
				if (enabled && typeof glob === 'string' && glob.length > 0) {
					patterns.add(glob);
				}
			}

			for (const [glob, enabled] of Object.entries(filesExclude)) {
				if (enabled && typeof glob === 'string' && glob.length > 0) {
					patterns.add(glob);
				}
			}

			const useIgnoreFiles = searchConfig.get<boolean>('useIgnoreFiles', true);
			if (useIgnoreFiles) {
				const folders = vscode.workspace.workspaceFolders;
				if (folders) {
					for (const folder of folders) {
						const gitignorePatterns = this.readGitignoreFile(path.join(folder.uri.fsPath, '.gitignore'));
						gitignorePatterns.forEach(p => patterns.add(p));
					}
				}
				const globalPatterns = this.readGitignoreFile(path.join(require('os').homedir(), '.config', 'git', 'ignore'));
				globalPatterns.forEach(p => patterns.add(p));
			}
		} catch {
			// ignore errors
		}

		return Array.from(patterns);
	}

	/**
	 * Read and parse a gitignore file
	 */
	private readGitignoreFile(filePath: string): string[] {
		try {
			if (require('fs').existsSync(filePath)) {
				const content = require('fs').readFileSync(filePath, 'utf8');
				return this.parseGitignore(content);
			}
		} catch {
			// ignore errors
		}
		return [];
	}

	/**
	 * Parse .gitignore content
	 */
	private parseGitignore(content: string): string[] {
		const results: string[] = [];

		for (const rawLine of content.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith('#') || line.startsWith('!')) {
				continue;
			}

			let transformed = line;
			if (transformed.endsWith('/')) {
				transformed = `${transformed.slice(0, -1)}/**`;
			}
			if (transformed.startsWith('/')) {
				transformed = transformed.slice(1);
			} else {
				transformed = `**/${transformed}`;
			}
			results.push(transformed);
		}

		return results;
	}

	/**
	 * Convert the exclusion pattern array into a glob string
	 * Private, used internally by searchFilesWithWorkspace
	 */
	private toExcludeGlob(patterns: string[]): string | undefined {
		if (patterns.length === 0) {
			return undefined;
		}
		if (patterns.length === 1) {
			return patterns[0];
		}
		return `{${patterns.join(',')}}`;
	}
}
