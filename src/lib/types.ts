// Tutorium shared types — PADAYON's payload shapes, tightened for voice-first use.

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizItem {
  question: string;
  choices: string[];
  answer: string; // index as string "0".."3" (LLM-proof)
  explanation: string;
}

export interface StudyPack {
  clean_notes: string;
  reviewer: string;
  flashcards: Flashcard[];
  quiz: QuizItem[];
  summary: string;
  story?: string;
}

export interface Classification {
  subject: string;
  subcategory: string;
  topic: string;
  intent: Intent;
  confidence: number;
}

export type Intent =
  | "create_study_pack"
  | "teach_topic"
  | "make_flashcards"
  | "make_quiz"
  | "make_summary"
  | "make_story"
  | "make_visual"
  | "retrieve_material"
  | "say_it_back"
  | "unknown";

export interface MemoryUpdate {
  learning_style_update: string;
  weakness_update: string;
  strength_update: string;
  next_recommended_action: string;
  student_note: string;
}

export interface LearnerProfile {
  id: string;
  user_id: string;
  name: string;
  learning_style: string;
  strengths: string[];
  weaknesses: string[];
  next_recommended_action: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Topic {
  id: string;
  subject_id: string;
  title: string;
  subcategory: string | null;
  curriculum_match: Record<string, unknown>;
  progress: Record<string, unknown>;
  last_studied_at: string;
  created_at: string;
}

export interface Material {
  id: string;
  topic_id: string;
  type: MaterialType;
  title: string;
  content: Record<string, unknown>;
  created_at: string;
}

export type MaterialType =
  | "clean_notes"
  | "reviewer"
  | "flashcards"
  | "quiz"
  | "summary"
  | "story"
  | "html_visual"
  | "teachback"
  | "sayitback"
  | "document"
  | "theme";

export interface Message {
  id: string;
  topic_id: string | null;
  role: "user" | "assistant";
  content: string;
  interactive: InteractivePayload | null;
  audio_meta?: Record<string, unknown> | null;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---- Interactive payloads (PADAYON pattern) ----

export interface InteractiveFlashcards {
  type: "flashcards";
  topic: string;
  topicId: string;
  cards: Flashcard[];
  theme?: TricksterTheme | null;
}

export interface InteractiveQuiz {
  type: "quiz";
  topic: string;
  topicId: string;
  questions: QuizItem[];
  theme?: TricksterTheme | null;
}

export interface InteractiveInfoCards {
  type: "info_cards";
  topic: string;
  topicId: string;
  cards: Array<{ icon?: string; title: string; body: string }>;
}

export interface InteractiveComparisonTable {
  type: "comparison_table";
  topic: string;
  topicId: string;
  headers: string[];
  rows: string[][];
}

export interface InteractiveHtmlVisual {
  type: "html_visual";
  topic: string;
  topicId: string;
  title: string;
  html: string;
}

export interface InteractiveStudyPackActions {
  type: "study_pack_actions";
  topic: string;
  topicId: string;
  actions: Array<{ label: string; materialType: string }>;
}

export interface InteractiveDocument {
  type: "document";
  topic: string;
  topicId: string;
  docTitle: string;
  pageCount: number;
  summary: string;
  keyTerms: string[];
  sections: Array<{ title: string; summary: string }>;
  difficulty: string;
  prerequisites: string[];
  plan: Array<{ day: number; focus: string; tasks: string[]; minutes: number; drill: string }>;
}

// Trickster data patch: validated in lib/trickster-schema.ts before use.
export interface TricksterTheme {
  vibe: string;
  accent: string;
  bg: string;
  radius: number;
  fontScale: number;
  icon: string;
  shuffleChoices: boolean;
  hideCorrectUntilPick: boolean;
  timePerQuestion: number;
  hintsEnabled: boolean;
  hintCount: number;
  hiddenAnswerStyle: "veil" | "blur" | "scratch" | null;
  streakMode: boolean;
  easterEgg: string | null;
  message: string;
  confetti: boolean;
}

// ---- Speechmatics-flavored payloads ----

export interface SayItBackResult {
  overall: number; // 0-100
  words: Array<{ word: string; confidence: number; status: "good" | "shaky" | "missed" }>;
  missedTerms: string[]; // curriculum terms from the passage not recognized well
}

export interface InteractiveSayItBack {
  type: "say_it_back";
  topic: string;
  topicId: string;
  passage: string; // what the student should read/explain
  keyTerms: string[]; // words the vocab hot-swap protected
}

export interface InteractiveHeatmap {
  type: "heatmap";
  topic?: string;
  topicId?: string;
  overall: number;
  words: Array<{ word: string; confidence: number; status: "good" | "shaky" | "missed" }>;
}

export interface InteractiveTeachBack {
  type: "teach_back";
  topic: string;
  topicId: string;
  transcript: string;
  verdict: string;
  missed: string[];
  next_step: string;
}

export interface InteractiveVocabPreview {
  type: "vocab_preview";
  topic: string;
  topicId: string;
  terms: string[];
}

export type InteractivePayload =
  | InteractiveFlashcards
  | InteractiveQuiz
  | InteractiveInfoCards
  | InteractiveComparisonTable
  | InteractiveHtmlVisual
  | InteractiveStudyPackActions
  | InteractiveDocument
  | InteractiveSayItBack
  | InteractiveHeatmap
  | InteractiveTeachBack
  | InteractiveVocabPreview;