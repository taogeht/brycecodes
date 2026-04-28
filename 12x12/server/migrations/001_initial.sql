-- Create schema for the flashcard application
CREATE SCHEMA IF NOT EXISTS srs;

-- Users table with authentication fields
CREATE TABLE IF NOT EXISTS srs.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    user_type VARCHAR(50) NOT NULL DEFAULT 'student', -- 'student' or 'teacher'
    picture_password VARCHAR(255), -- For picture-based authentication
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cards table (flashcard content)
CREATE TABLE IF NOT EXISTS srs.cards (
    id SERIAL PRIMARY KEY,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Card state table (tracks user's progress on each card) - this replaces user_cards
CREATE TABLE IF NOT EXISTS srs.card_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES srs.users(id) ON DELETE CASCADE,
    card_id INTEGER NOT NULL REFERENCES srs.cards(id) ON DELETE CASCADE,
    due_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    interval_days INTEGER DEFAULT 0,
    ease_factor FLOAT DEFAULT 2.5,
    reps INTEGER DEFAULT 0, -- renamed from repetitions for consistency
    last_reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, card_id)
);

-- Student progress tracking table
CREATE TABLE IF NOT EXISTS srs.student_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES srs.users(id) ON DELETE CASCADE,
    total_reviews INTEGER DEFAULT 0,
    correct_reviews INTEGER DEFAULT 0,
    cards_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Reviews table for analytics
CREATE TABLE IF NOT EXISTS srs.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES srs.users(id) ON DELETE CASCADE,
    card_id INTEGER NOT NULL REFERENCES srs.cards(id) ON DELETE CASCADE,
    grade VARCHAR(20) NOT NULL CHECK (grade IN ('again', 'hard', 'good', 'easy')),
    rating INTEGER NOT NULL DEFAULT 2 CHECK (rating BETWEEN 0 AND 3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
DECLARE
  rating_exists BOOLEAN;
  grade_exists BOOLEAN;
  rating_type TEXT;
  rating_udt TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'srs'
       AND table_name = 'reviews'
       AND column_name = 'rating'
  ) INTO rating_exists;

  IF rating_exists THEN
    SELECT data_type, udt_schema || '.' || udt_name
      INTO rating_type, rating_udt
      FROM information_schema.columns
     WHERE table_schema = 'srs'
       AND table_name = 'reviews'
       AND column_name = 'rating';

    IF rating_type = 'USER-DEFINED' THEN
      EXECUTE $conv$
        ALTER TABLE srs.reviews
          ALTER COLUMN rating DROP DEFAULT,
          ALTER COLUMN rating TYPE INTEGER
          USING CASE rating::text
                 WHEN 'again' THEN 0
                 WHEN 'hard' THEN 1
                 WHEN 'good' THEN 2
                 WHEN 'easy' THEN 3
                 ELSE 2
               END
      $conv$;
    ELSIF rating_type IN ('character varying', 'text') THEN
      EXECUTE $conv$
        ALTER TABLE srs.reviews
          ALTER COLUMN rating DROP DEFAULT,
          ALTER COLUMN rating TYPE INTEGER
          USING CASE rating
                 WHEN 'again' THEN 0
                 WHEN 'hard' THEN 1
                 WHEN 'good' THEN 2
                 WHEN 'easy' THEN 3
                 WHEN '0' THEN 0
                 WHEN '1' THEN 1
                 WHEN '2' THEN 2
                 WHEN '3' THEN 3
                 ELSE 2
               END
      $conv$;
    ELSIF rating_type IS NOT NULL AND rating_type <> 'integer' THEN
      EXECUTE $conv$
        ALTER TABLE srs.reviews
          ALTER COLUMN rating DROP DEFAULT,
          ALTER COLUMN rating TYPE INTEGER
          USING rating::integer
      $conv$;
    END IF;
  ELSE
    EXECUTE $conv$
      ALTER TABLE srs.reviews
        ADD COLUMN rating INTEGER
    $conv$;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'srs'
       AND table_name = 'reviews'
       AND column_name = 'grade'
  ) INTO grade_exists;

  IF NOT grade_exists THEN
    EXECUTE $conv$
      ALTER TABLE srs.reviews
        ADD COLUMN grade VARCHAR(20)
    $conv$;
  END IF;
END$$;

UPDATE srs.reviews
   SET rating = CASE
                 WHEN rating IS NULL AND grade IS NOT NULL THEN
                   CASE grade
                     WHEN 'again' THEN 0
                     WHEN 'hard' THEN 1
                     WHEN 'good' THEN 2
                     WHEN 'easy' THEN 3
                     ELSE 2
                   END
                 ELSE rating
               END;

UPDATE srs.reviews
   SET grade = CASE
                 WHEN grade IS NULL AND rating IS NOT NULL THEN
                   CASE rating
                     WHEN 0 THEN 'again'
                     WHEN 1 THEN 'hard'
                     WHEN 2 THEN 'good'
                     WHEN 3 THEN 'easy'
                     ELSE 'good'
                   END
                 ELSE COALESCE(grade, 'good')
               END;

ALTER TABLE srs.reviews
  ALTER COLUMN rating SET DEFAULT 2;

ALTER TABLE srs.reviews
  ALTER COLUMN rating SET NOT NULL;

ALTER TABLE srs.reviews
  ALTER COLUMN grade SET DEFAULT 'good';

ALTER TABLE srs.reviews
  ALTER COLUMN grade SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE srs.reviews
    ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 0 AND 3);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  ALTER TABLE srs.reviews
    ADD CONSTRAINT reviews_grade_check CHECK (grade IN ('again', 'hard', 'good', 'easy'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_srs_users_username ON srs.users(username);
CREATE INDEX IF NOT EXISTS idx_srs_users_type ON srs.users(user_type);
CREATE INDEX IF NOT EXISTS idx_srs_card_state_user_id ON srs.card_state(user_id);
CREATE INDEX IF NOT EXISTS idx_srs_card_state_due_at ON srs.card_state(due_at);
CREATE INDEX IF NOT EXISTS idx_srs_card_state_card_id ON srs.card_state(card_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_srs_cards_front_back ON srs.cards(front, back);
CREATE INDEX IF NOT EXISTS idx_srs_student_progress_user_id ON srs.student_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_srs_reviews_user_id ON srs.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_srs_reviews_created_at ON srs.reviews(created_at);

-- Populate multiplication flashcards for the full 12 × 12 table
DO $$
DECLARE
  multiplicand INTEGER;
  multiplier INTEGER;
  front_label TEXT;
  back_value TEXT;
BEGIN
  FOR multiplicand IN 1..12 LOOP
    FOR multiplier IN 1..12 LOOP
      front_label := CONCAT(multiplicand, ' × ', multiplier);
      back_value := (multiplicand * multiplier)::TEXT;
      INSERT INTO srs.cards (front, back)
      VALUES (front_label, back_value)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Deck management support
CREATE TABLE IF NOT EXISTS srs.decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_by UUID REFERENCES srs.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE srs.cards
    ADD COLUMN IF NOT EXISTS deck_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'srs'
       AND indexname = 'idx_srs_cards_front_back'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS srs.idx_srs_cards_front_back';
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_srs_cards_deck_front_back ON srs.cards(deck_id, front, back);

CREATE INDEX IF NOT EXISTS idx_srs_cards_deck_id ON srs.cards(deck_id);

DO $$
DECLARE
  default_deck_id UUID;
BEGIN
  SELECT id INTO default_deck_id
    FROM srs.decks
   WHERE name = 'Multiplication 12×12';

  IF default_deck_id IS NULL THEN
    INSERT INTO srs.decks (name, description)
    VALUES ('Multiplication 12×12', 'Default multiplication deck covering factors 1–12')
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO default_deck_id;

    IF default_deck_id IS NULL THEN
      SELECT id INTO default_deck_id
        FROM srs.decks
       WHERE name = 'Multiplication 12×12'
       LIMIT 1;
    END IF;
  END IF;

  IF default_deck_id IS NOT NULL THEN
    UPDATE srs.cards
       SET deck_id = default_deck_id
     WHERE deck_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE srs.cards
    ADD CONSTRAINT fk_cards_deck FOREIGN KEY (deck_id)
    REFERENCES srs.decks(id)
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE srs.cards
    ALTER COLUMN deck_id SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;
