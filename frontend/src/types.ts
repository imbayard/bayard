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
  total_modules: number;
  completed_modules: number;
}

// --- Artifact types ---

export interface FlashcardsData {
  cards: { front: string; back: string }[];
}

export interface QuizData {
  questions: { question: string; options: string[]; answer: string }[];
  responses?: { selected: string }[];
}

export interface ExerciseData {
  exercises: { name: string; reps: string; instructions: string }[];
}

export type ExerciseItem = ExerciseData["exercises"][number];

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

export interface CodeExerciseData {
  description: string;
  starter_code: string;
  tests?: string;
}

export type Artifact =
  | { id: number; module_id: number; type: 'flashcards'; data: FlashcardsData; created_at: string }
  | { id: number; module_id: number; type: 'quiz';       data: QuizData;       created_at: string }
  | { id: number; module_id: number; type: 'exercise';   data: ExerciseData;   created_at: string }
  | { id: number; module_id: number; type: 'reading';    data: ReadingData;    created_at: string }
  | { id: number; module_id: number; type: 'video';      data: VideoData;      created_at: string }
  | { id: number; module_id: number; type: 'project';    data: ProjectData;    created_at: string }
  | { id: number; module_id: number; type: 'checklist';  data: ChecklistData;  created_at: string }
  | { id: number; module_id: number; type: 'reference';      data: ReferenceData;      created_at: string }
  | { id: number; module_id: number; type: 'code_exercise';  data: CodeExerciseData;  created_at: string }

export type ArtifactType = Artifact['type']

// --- Calendar types ---

export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  type: 'module' | 'habit' | 'external'
  series_id?: string   // set on recurring event instances; delete this to remove all occurrences
  module_id?: number
}

export interface AllModule {
  id: number
  name: string
  plan_id: number
  plan_title: string
  status: 'locked' | 'active' | 'completed'
}
