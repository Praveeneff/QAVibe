CREATE SEQUENCE IF NOT EXISTS tc_id_seq START 1;

-- Sync sequence to current max so existing IDs are not reused
SELECT setval(
  'tc_id_seq',
  GREATEST(1, COALESCE((
    SELECT MAX(CAST(SUBSTRING("tcId" FROM 4) AS INTEGER))
    FROM "TestCase"
    WHERE "tcId" ~ '^TC-[0-9]+$'
  ), 1))
);
