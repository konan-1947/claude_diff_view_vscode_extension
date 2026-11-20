/**
 * Tool UI context interface
 * Gives tool rendering access to file operations and similar features
 */
export interface ToolContext {
  fileOpener: {
    open: (filePath: string, location?: { startLine?: number; endLine?: number }) => void;
    openContent: (content: string, fileName: string, editable: boolean) => void;
  };
}

/**
 * Tool permission request renderer interface
 * Each tool can implement its own permission request UI
 */
export interface ToolPermissionRenderer {
  /**
   * Render the permission request UI
   * @param context tool context
   * @param inputs tool input parameters
   * @param onModify callback for modifying the inputs
   */
  renderPermissionRequest(
    context: ToolContext,
    inputs: any,
    onModify?: (newInputs: any) => void
  ): any;
}
