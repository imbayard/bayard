export interface Module {
  id?: number;
  name: string;
  description: string;
  type: 'physical' | 'conceptual' | 'applicable';
  status: 'locked' | 'active' | 'completed';
}

export interface LessonPlan {
  id: number;
  title: string;
  plan: string;
  status: string;
  created_at: string;
}

// --- Artifact types ---

export interface ChecklistData {
  items: { label: string; completed: boolean }[];
}

export interface ListBuilderData {
  prerequisites: string[];
  steps: { label: string; description?: string }[];
}

export interface ComparisonTableData {
  columns: string[];
  rows: { label: string; values: string[] }[];
}

export interface FlashcardSetData {
  cards: { front: string; back: string }[];
}

export interface GanttChartData {
  phases: { name: string; start: string; end: string; tasks: string[] }[];
}

export interface CodeEditorData {
  language: string;
  code: string;
  runnable: boolean;
}

export interface SystemDiagramData {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; label?: string }[];
}

export interface GeneratedData {
  markdown: string;
}

export type Artifact =
  | { id: number; module_id: number; type: 'checklist';        data: ChecklistData;       created_at: string }
  | { id: number; module_id: number; type: 'list_builder';     data: ListBuilderData;     created_at: string }
  | { id: number; module_id: number; type: 'comparison_table'; data: ComparisonTableData; created_at: string }
  | { id: number; module_id: number; type: 'flashcard_set';    data: FlashcardSetData;    created_at: string }
  | { id: number; module_id: number; type: 'gantt_chart';      data: GanttChartData;      created_at: string }
  | { id: number; module_id: number; type: 'code_editor';      data: CodeEditorData;      created_at: string }
  | { id: number; module_id: number; type: 'system_diagram';   data: SystemDiagramData;   created_at: string }
  | { id: number; module_id: number; type: 'generated';        data: GeneratedData;       created_at: string }

export type ArtifactType = Artifact['type']
