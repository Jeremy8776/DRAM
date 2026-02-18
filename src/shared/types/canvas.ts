export type CanvasViewMode = 'code' | 'render';

export interface CanvasVersionEntry {
  id: string;
  fileKey: string;
  label: string;
  createdAt: string;
  bytes: number;
}

export interface CanvasFileSelection {
  fileKey: string;
  path?: string;
  language?: string;
  viewMode?: CanvasViewMode;
}

export interface CanvasAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  textContent?: string;
  textLike?: boolean;
}

export interface CanvasSessionState {
  workspacePath?: string;
  selected?: CanvasFileSelection;
  versions: CanvasVersionEntry[];
  attachments: CanvasAttachment[];
}
