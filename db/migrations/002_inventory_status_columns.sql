BEGIN;

ALTER TABLE inventory_node
  ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'Normal';

ALTER TABLE inventory_rack
  ADD COLUMN IF NOT EXISTS environment_status TEXT NOT NULL DEFAULT 'Normal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_inventory_node_health_status_allowed'
  ) THEN
    ALTER TABLE inventory_node
      ADD CONSTRAINT ck_inventory_node_health_status_allowed
      CHECK (health_status IN ('Normal', 'Warning', 'Critico'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_inventory_rack_environment_status_allowed'
  ) THEN
    ALTER TABLE inventory_rack
      ADD CONSTRAINT ck_inventory_rack_environment_status_allowed
      CHECK (environment_status IN ('Normal', 'Warning', 'Critico'));
  END IF;
END
$$;

COMMIT;
