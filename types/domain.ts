export type AppRole = "user" | "admin";
export type SessionStatus = "created" | "active" | "processing" | "completed" | "failed";
export type Trend = "up" | "stable" | "down" | "insufficient_data";

export interface UserContext {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  role: AppRole;
}

export interface DynamicVariables {
  [key: string]: string | number | boolean;
  user_first_name: string;
  training_type: string;
  scenario: string;
  conversation_occasion: string;
  context_collection_instruction: string;
  global_strengths: string;
  global_focus_areas: string;
  training_strengths: string;
  training_focus_areas: string;
  recent_session_summaries: string;
  current_learning_goal: string;
  session_mode: string;
  session_focus: string;
  available_training_focuses: string;
}

export interface ScoreEntry {
  competencyId: string;
  competencyName: string;
  score: number;
  completedAt: string;
}

export interface CompetencyAggregate {
  competencyId: string;
  competencyName: string;
  sessionCount: number;
  averageScore: number;
  latestScore: number;
  trend: Trend;
}
