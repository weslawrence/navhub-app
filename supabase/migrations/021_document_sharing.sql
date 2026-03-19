-- Migration 021: Document Sharing (no-op)
--
-- The share_token, is_shareable, and share_token_created_at columns were
-- already added to the documents table in migration 014_documents.sql.
-- The unique index uq_documents_share_token was also created in that migration.
-- No schema changes are required.
--
-- The share API routes (GET/POST/DELETE /api/documents/[id]/share) and the
-- standalone viewer (app/view/document/[id]/page.tsx) that use these columns
-- were implemented as part of Phase 7a/7d.

SELECT 1;
