-- Remove definitivamente os dados da funcionalidade descontinuada de montagem de times.
-- Execute uma única vez no banco PostgreSQL do FutPontos após o deploy da API sem as rotas.
BEGIN;
DROP TABLE IF EXISTS montagem_times;
COMMIT;
