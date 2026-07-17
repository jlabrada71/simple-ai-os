CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  variables TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No foreign key to prompts(id) on purpose: history rows must survive deletion
-- of their parent prompt (see action = 'deleted' below).
CREATE TABLE IF NOT EXISTS prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  variables TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL CHECK (action IN ('updated', 'deleted')),
  prompt_created_at TIMESTAMPTZ NOT NULL,
  prompt_updated_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_history_prompt_id ON prompt_history (prompt_id);
