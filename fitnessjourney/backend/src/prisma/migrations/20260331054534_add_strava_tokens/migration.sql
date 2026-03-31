-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_key" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "wake_time" TEXT,
    "sleep_time" TEXT,
    "notes" TEXT,
    "hydration_ml" INTEGER,
    "stress_level" INTEGER,
    "energy_level" INTEGER,
    "soreness_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meals" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "meal_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" DOUBLE PRECISION,
    "protein_g" DOUBLE PRECISION,
    "carbs_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "fibre_g" DOUBLE PRECISION,
    "photo_url" TEXT,
    "notes" TEXT,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "template_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_components" (
    "id" TEXT NOT NULL,
    "meal_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight_g" DOUBLE PRECISION,
    "calories" DOUBLE PRECISION,
    "protein_g" DOUBLE PRECISION,
    "carbs_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "fibre_g" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workouts" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "duration_mins" INTEGER,
    "active_calories" DOUBLE PRECISION,
    "total_calories" DOUBLE PRECISION,
    "avg_heart_rate" INTEGER,
    "max_heart_rate" INTEGER,
    "distance_km" DOUBLE PRECISION,
    "avg_pace" TEXT,
    "effort_level" INTEGER,
    "volume_load" DOUBLE PRECISION,
    "sets" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplements" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose_mg" DOUBLE PRECISION,
    "taken_at" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_metrics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "body_fat_pct" DOUBLE PRECISION,
    "muscle_mass_kg" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "hip_cm" DOUBLE PRECISION,
    "chest_cm" DOUBLE PRECISION,
    "notes" TEXT,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "goal_type" TEXT NOT NULL,
    "target_value" DOUBLE PRECISION NOT NULL,
    "start_date" DATE NOT NULL,
    "target_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exercise_name" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "previous_best" DOUBLE PRECISION,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_templates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meal_type" TEXT NOT NULL,
    "calories" DOUBLE PRECISION,
    "protein_g" DOUBLE PRECISION,
    "carbs_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "fibre_g" DOUBLE PRECISION,
    "components" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sleep_logs" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "bed_time" TEXT,
    "wake_time" TEXT,
    "total_mins" INTEGER NOT NULL,
    "awake_mins" INTEGER,
    "rem_mins" INTEGER,
    "core_mins" INTEGER,
    "deep_mins" INTEGER,
    "deep_sleep_pct" DOUBLE PRECISION,
    "rem_pct" DOUBLE PRECISION,
    "quality_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sleep_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_rings" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT NOT NULL,
    "move_cal" INTEGER,
    "move_goal" INTEGER,
    "exercise_mins" INTEGER,
    "exercise_goal" INTEGER,
    "stand_hrs" INTEGER,
    "stand_goal" INTEGER,
    "step_count" INTEGER,
    "step_distance_km" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_rings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strava_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" INTEGER NOT NULL,
    "scope" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strava_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_logs" (
    "id" TEXT NOT NULL,
    "daily_log_id" TEXT,
    "date" DATE NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meals_count" INTEGER,
    "workouts_count" INTEGER,
    "status" TEXT NOT NULL,
    "raw_json" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_api_key_key" ON "users"("api_key");

-- CreateIndex
CREATE INDEX "daily_logs_date_idx" ON "daily_logs"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_user_id_date_key" ON "daily_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "body_metrics_user_id_date_idx" ON "body_metrics"("user_id", "date");

-- CreateIndex
CREATE INDEX "personal_records_user_id_exercise_name_idx" ON "personal_records"("user_id", "exercise_name");

-- CreateIndex
CREATE UNIQUE INDEX "sleep_logs_daily_log_id_key" ON "sleep_logs"("daily_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_rings_daily_log_id_key" ON "activity_rings"("daily_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "strava_tokens_user_id_key" ON "strava_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_logs_daily_log_id_key" ON "import_logs"("daily_log_id");

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_components" ADD CONSTRAINT "meal_components_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplements" ADD CONSTRAINT "supplements_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_metrics" ADD CONSTRAINT "body_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sleep_logs" ADD CONSTRAINT "sleep_logs_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_rings" ADD CONSTRAINT "activity_rings_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strava_tokens" ADD CONSTRAINT "strava_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_logs" ADD CONSTRAINT "import_logs_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
