export interface Module {
  id?: number;
  name: string;
  description: string;
  key_points: string[];
  challenge: string;
}

export interface LessonPlan {
  id: number;
  title: string;
  plan: string;
  status: string;
  created_at: string;
}
