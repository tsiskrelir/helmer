-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Inquiries table
CREATE TABLE IF NOT EXISTS inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status VARCHAR(50) NOT NULL DEFAULT 'new',
    legal_area VARCHAR(100),
    legal_topic VARCHAR(100),
    case_worker_id INTEGER,
    channel VARCHAR(20) NOT NULL DEFAULT 'chatbot', -- 'chatbot' or 'email'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    exported_to_kleos_at TIMESTAMP,
    kleos_contact_id VARCHAR(255),
    kleos_case_id VARCHAR(255),
    deleted_at TIMESTAMP
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inquiry_id UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    street VARCHAR(255),
    house_number VARCHAR(50),
    zip_code VARCHAR(20),
    town VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inquiry_id UUID REFERENCES inquiries(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    message TEXT NOT NULL,
    sender VARCHAR(20) NOT NULL, -- 'user' or 'bot'
    message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'choice', 'file', 'contact'
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inquiry_id UUID REFERENCES inquiries(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    filepath VARCHAR(500) NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    kleos_document_id VARCHAR(255)
);

-- Email intakes table
CREATE TABLE IF NOT EXISTS email_intakes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inquiry_id UUID REFERENCES inquiries(id) ON DELETE SET NULL,
    email_id VARCHAR(255) UNIQUE NOT NULL,
    from_email VARCHAR(255),
    from_name VARCHAR(255),
    subject VARCHAR(500),
    body_text TEXT,
    body_html TEXT,
    parsed_data JSONB,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kleos exports table
CREATE TABLE IF NOT EXISTS kleos_exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inquiry_id UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    kleos_contact_id VARCHAR(255),
    kleos_case_id VARCHAR(255),
    export_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'success', 'failed'
    error_message TEXT,
    exported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table (dedicated session state, separate from conversation messages)
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    current_step VARCHAR(255) NOT NULL DEFAULT 'start',
    flow_path JSONB NOT NULL DEFAULT '[]'::jsonb,
    collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    inquiry_id UUID REFERENCES inquiries(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);

-- Settings table (key-value store for admin configuration)
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value)
VALUES ('chatbot_enabled', 'true'), ('last_kleos_case_number', '516')
ON CONFLICT (key) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_inquiries_channel ON inquiries(channel);
CREATE INDEX IF NOT EXISTS idx_contacts_inquiry_id ON contacts(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_conversations_inquiry_id ON conversations(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_documents_inquiry_id ON documents(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_email_intakes_inquiry_id ON email_intakes(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_kleos_exports_inquiry_id ON kleos_exports(inquiry_id);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for inquiries table
DROP TRIGGER IF EXISTS update_inquiries_updated_at ON inquiries;
CREATE TRIGGER update_inquiries_updated_at BEFORE UPDATE ON inquiries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

