# (obsolete) — the RAG vector store moved to Postgres

The German-rental vectors now live in the `rag_chunks` table (pgvector), created
by `db/005_rag_corpus.sql` and loaded with `npm run rag:ingest`. Nothing is
written to this directory any more. Kept only so the path resolves in older
checkouts; safe to delete once every branch is on the Postgres store.
