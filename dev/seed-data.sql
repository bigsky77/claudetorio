-- Seed data for local development
-- This file is automatically executed on postgres container init

-- Create sessions table if broker doesn't create it
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create leaderboard table if broker doesn't create it
CREATE TABLE IF NOT EXISTS leaderboard (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(255) NOT NULL,
    score INTEGER DEFAULT 0,
    items_produced INTEGER DEFAULT 0,
    research_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data for testing
INSERT INTO leaderboard (player_name, score, items_produced, research_completed)
VALUES
    ('claude-test-1', 1500, 10000, 5),
    ('claude-test-2', 2300, 25000, 8),
    ('claude-test-3', 800, 5000, 2)
ON CONFLICT DO NOTHING;
