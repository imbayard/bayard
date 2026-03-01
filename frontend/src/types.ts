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

export interface FlashcardsData {
  cards: { front: string; back: string }[];
}

export interface QuizData {
  questions: { question: string; options: string[]; answer: string }[];
}

export interface ExerciseData {
  objective: string;
  steps: string[];
}

export interface ReadingData {
  title: string;
  body: string;
}

export interface VideoData {
  query: string;
  topics: string[];
}

export interface ProjectData {
  description: string;
  deliverables: string[];
}

export interface ChecklistData {
  items: string[];
  checked?: boolean[];
}

export interface ReferenceData {
  sections: { heading: string; content: string }[];
}

export type Artifact =
  | { id: number; module_id: number; type: 'flashcards'; data: FlashcardsData; created_at: string }
  | { id: number; module_id: number; type: 'quiz';       data: QuizData;       created_at: string }
  | { id: number; module_id: number; type: 'exercise';   data: ExerciseData;   created_at: string }
  | { id: number; module_id: number; type: 'reading';    data: ReadingData;    created_at: string }
  | { id: number; module_id: number; type: 'video';      data: VideoData;      created_at: string }
  | { id: number; module_id: number; type: 'project';    data: ProjectData;    created_at: string }
  | { id: number; module_id: number; type: 'checklist';  data: ChecklistData;  created_at: string }
  | { id: number; module_id: number; type: 'reference';  data: ReferenceData;  created_at: string }

export type ArtifactType = Artifact['type']
