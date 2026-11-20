/**
 * Attachment type definitions
 */

/**
 * Attachment preview (for UI display)
 */
export interface AttachmentPreview {
  id: string;
  fileName: string;
  fileSize: number;
  mediaType: string;
}

/**
 * Full attachment data (sent to the backend)
 */
export interface AttachmentPayload {
  fileName: string;
  mediaType: string;
  data: string; // base64 encoded (without the data:xxx prefix)
  fileSize?: number;
}

/**
 * Internal attachment data (includes the ID)
 */
export interface AttachmentItem extends AttachmentPayload {
  id: string;
  fileSize: number;
}

/**
 * Supported image MIME types
 */
export const IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/**
 * Format a file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Convert a File object to an AttachmentItem
 */
export async function convertFileToAttachment(file: File): Promise<AttachmentItem> {
  // Read the file as base64
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  // Parse the data URL: "data:image/png;base64,iVBORw0KGgo..."
  const [prefix, data] = dataUrl.split(',');
  const match = prefix.match(/data:([^;]+);base64/);
  const mediaType = (match ? match[1] : 'application/octet-stream').toLowerCase();

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fileName: file.name,
    mediaType,
    data, // plain base64 string (without the prefix)
    fileSize: file.size,
  };
}
