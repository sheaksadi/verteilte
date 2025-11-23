CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

CREATE TABLE IF NOT EXISTS words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original TEXT NOT NULL,
  translation TEXT NOT NULL,
  article TEXT DEFAULT '',
  language VARCHAR(10) NOT NULL DEFAULT 'de',
  score INTEGER DEFAULT 0,
  created_at BIGINT NOT NULL,
  last_reviewed_at BIGINT DEFAULT 0,
  next_review_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  deleted_at BIGINT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_words_user_id ON words(user_id);
CREATE INDEX IF NOT EXISTS idx_words_updated_at ON words(updated_at);
CREATE INDEX IF NOT EXISTS idx_words_language ON words(language);
