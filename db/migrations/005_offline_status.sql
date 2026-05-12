DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_inventory_node_health_status_allowed'
  ) THEN
    ALTER TABLE inventory_node
      DROP CONSTRAINT ck_inventory_node_health_status_allowed;
  END IF;

  ALTER TABLE inventory_node
    ADD CONSTRAINT ck_inventory_node_health_status_allowed
    CHECK (health_status IN ('Normal', 'Warning', 'Critico', 'OFFLINE'));
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_inventory_rack_environment_status_allowed'
  ) THEN
    ALTER TABLE inventory_rack
      DROP CONSTRAINT ck_inventory_rack_environment_status_allowed;
  END IF;

  ALTER TABLE inventory_rack
    ADD CONSTRAINT ck_inventory_rack_environment_status_allowed
    CHECK (environment_status IN ('Normal', 'Warning', 'Critico', 'OFFLINE'));
END $$;
