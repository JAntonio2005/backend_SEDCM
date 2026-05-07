BEGIN;

CREATE TABLE IF NOT EXISTS audit_command_log (
  id BIGSERIAL PRIMARY KEY,
  command_id TEXT NOT NULL UNIQUE,
  zone_code TEXT NOT NULL,
  rack_code TEXT NOT NULL,
  node_id TEXT,
  target_type TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  mqtt_topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  ack_status TEXT NOT NULL DEFAULT 'PENDING',
  ack_received_at TIMESTAMPTZ,
  ack_payload JSONB,
  CONSTRAINT fk_audit_command_log_rack FOREIGN KEY (zone_code, rack_code)
    REFERENCES inventory_rack(zone_code, rack_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT ck_audit_command_log_target_type CHECK (target_type IN ('nodo', 'rack')),
  CONSTRAINT ck_audit_command_log_action CHECK (
    action IN ('soft_reboot', 'hard_shutdown', 'set_hvac_mode')
  ),
  CONSTRAINT ck_audit_command_log_ack_status CHECK (
    ack_status IN ('PENDING', 'RECEIVED', 'FAILED')
  )
);

CREATE INDEX IF NOT EXISTS ix_audit_command_log_issued_at
  ON audit_command_log(issued_at DESC);

CREATE INDEX IF NOT EXISTS ix_audit_command_log_pending_lookup
  ON audit_command_log(zone_code, rack_code, node_id, target_type, action, reason, issued_at DESC)
  WHERE ack_status = 'PENDING';

COMMIT;
