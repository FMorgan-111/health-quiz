import type {
  QuestionType,
  ScoringAnswer,
  ScoringQuestion,
} from "../scoring";

export interface QuestionRow {
  id: string;
  dimension: string;
  type: QuestionType;
  required: boolean;
  max_value: number | null;
  step: number;
  order: number;
}

export interface AssessmentAnswerRow {
  assessment_id: string;
  question_id: string;
  step: number;
  value: unknown;
}

function numericValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toScoringQuestions(rows: QuestionRow[]): ScoringQuestion[] {
  return rows.map((row) => ({
    id: row.id,
    dimension: row.dimension,
    type: row.type,
    required: row.required,
    maxValue: row.max_value ?? 0,
  }));
}

export function toScoringAnswers(rows: AssessmentAnswerRow[]): ScoringAnswer[] {
  return rows.map((row) => ({
    questionId: row.question_id,
    value: numericValue(row.value),
  }));
}
