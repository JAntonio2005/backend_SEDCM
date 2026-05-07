BEGIN;

UPDATE audit_command_log
SET ack_status = 'ACKED'
WHERE ack_status = 'RECEIVED';

ALTER TABLE audit_command_log
  DROP CONSTRAINT IF EXISTS ck_audit_command_log_ack_status;

ALTER TABLE audit_command_log
  ADD CONSTRAINT ck_audit_command_log_ack_status
  CHECK (ack_status IN ('PENDING', 'ACKED', 'FAILED'));

COMMIT;
