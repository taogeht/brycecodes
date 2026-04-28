export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface CardDTO {
  card_state_id: string;
  card_id: number;
  front: string;
  back: string;
  next_review: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  last_grade: Grade | null;
}
