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
    
    // Nếu không tìm thấy file hiện tại (đang ở file khác không có diff),
    // chọn biên phù hợp theo hướng để điều hướng không bị wrap.
    if (currentIndex === -1) {
      currentIndex = direction > 0 ? 0 : pendingFiles.length - 1;
    } else {
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= pendingFiles.length) {
        return;
      }
      currentIndex = targetIndex;
    }

    const targetPath = pendingFiles[currentIndex];
    await this.diffManager.openDiff(targetPath);
  }

  /**
   * Lấy danh sách thông tin để hiển thị trên thanh điều hướng.
   */
  getNavigationInfo(currentFilePath: string) {
    const pendingFiles = this.diffManager.getPendingFiles();
    if (pendingFiles.length === 0) { return undefined; }

    const currentPath = normalizePath(currentFilePath);
    let currentIndex = pendingFiles.indexOf(currentPath);
    
    // Nếu current file không còn pending (ví dụ vừa Accept/Revert xong),
    // vẫn hiển thị prev/next dựa trên file pending đầu tiên để nút điều hướng hoạt động liên tục.
    if (currentIndex === -1) { currentIndex = 0; }

    const canPrev = currentIndex > 0;
    const canNext = currentIndex < pendingFiles.length - 1;
    const prevName = canPrev ? path.basename(pendingFiles[currentIndex - 1]) : '';
    const nextName = canNext ? path.basename(pendingFiles[currentIndex + 1]) : '';

    return {
      currentIdx: currentIndex + 1,
      total: pendingFiles.length,
      prevName,
      nextName,
      canPrev,
      canNext,
    };
  }
}
