-- Add design_config JSONB column to reel_jobs.
-- Run this once in the Supabase SQL editor.
ALTER TABLE reel_jobs
  ADD COLUMN IF NOT EXISTS design_config JSONB DEFAULT NULL;
