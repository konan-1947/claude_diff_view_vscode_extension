import * as vscode from 'vscode';
import * as path from 'path';
import { DiffManager } from './diffManager';

/** Normalize path helper */
function normalizePath(filePath: string): string {
  const fsPath = vscode.Uri.file(path.resolve(filePath)).fsPath;
  return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
}

export class NavigationManager {
  constructor(private readonly diffManager: DiffManager) {}

  /**
   * Chuyển sang file tiếp theo trong danh sách pending diffs.
   */
  async nextFile(): Promise<void> {
    await this.navigate(1);
  }

  /**
   * Quay lại file trước đó trong danh sách pending diffs.
   */
  async prevFile(): Promise<void> {
    await this.navigate(-1);
  }

  private async navigate(direction: number): Promise<void> {
    const pendingFiles = this.diffManager.getPendingFiles();
    if (pendingFiles.length <= 1) {
      if (pendingFiles.length === 0) {
        vscode.window.showInformationMessage('No files with pending diffs.');
      }
      return;
    }

    const currentEditor = vscode.window.activeTextEditor;
    const currentPath = currentEditor ? normalizePath(currentEditor.document.uri.fsPath) : '';
    
    let currentIndex = pendingFiles.indexOf(currentPath);
    
    // Nếu không tìm thấy file hiện tại (đang ở file khác ko có diff), mặc định nhảy vào file đầu tiên
    if (currentIndex === -1) {
      currentIndex = 0;
    } else {
      currentIndex = (currentIndex + direction + pendingFiles.length) % pendingFiles.length;
    }

    const targetPath = pendingFiles[currentIndex];
    await this.diffManager.openDiff(targetPath);
  }

  /**
   * Lấy danh sách thông tin để hiển thị trên thanh điều hướng.
   */
  getNavigationInfo(currentFilePath: string) {
    const pendingFiles = this.diffManager.getPendingFiles();
    if (pendingFiles.length <= 1) { return undefined; }

    const currentPath = normalizePath(currentFilePath);
    const currentIndex = pendingFiles.indexOf(currentPath);
    
    if (currentIndex === -1) { return undefined; }

    const prevIndex = (currentIndex - 1 + pendingFiles.length) % pendingFiles.length;
    const nextIndex = (currentIndex + 1) % pendingFiles.length;

    return {
      currentIdx: currentIndex + 1,
      total: pendingFiles.length,
      prevName: path.basename(pendingFiles[prevIndex]),
      nextName: path.basename(pendingFiles[nextIndex]),
    };
  }
}
