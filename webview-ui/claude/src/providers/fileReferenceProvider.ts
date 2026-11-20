import type { DropdownItemType } from '../types/dropdown'
import type { RuntimeInstance } from '../composables/useRuntime'

/**
 * File reference item
 */
export interface FileReference {
  path: string
  name: string
  type: 'file' | 'directory'
}

/**
 * Get the file list
 * @param query search query
 * @param runtime Runtime instance
 * @param signal optional AbortSignal for cancelling the request
 * @returns array of file references
 */
export async function getFileReferences(
  query: string,
  runtime: RuntimeInstance | undefined,
  signal?: AbortSignal
): Promise<FileReference[]> {
  if (!runtime) {
    console.warn('[fileReferenceProvider] No runtime available')
    return []
  }

  try {
    const connection = await runtime.connectionManager.get()

    // An empty query sends an empty string so the backend returns top-level content (directories + top-level files)
    const pattern = (query && query.trim()) ? query : ''
    const response = await connection.listFiles(pattern, signal)

    // response.files format: { path, name, type }
    return response.files || []
  } catch (error) {
    // Silently ignore AbortError
    if (error instanceof Error && error.name === 'AbortError') {
      return []
    }
    console.error('[fileReferenceProvider] Failed to list files:', error)
    return []
  }
}

/**
 * Convert a file reference to the DropdownItem format
 */
export function fileToDropdownItem(file: FileReference): DropdownItemType {
  return {
    id: `file-${file.path}`,
    type: 'item',
    label: file.name,
    detail: file.path,
    // No icon set here; the FileIcon component matches by isDirectory/folderName
    data: {
      file
    }
  }
}
