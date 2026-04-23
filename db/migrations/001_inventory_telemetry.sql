BEGIN;

CREATE TABLE IF NOT EXISTS inventory_zone (
  zone_code TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_inventory_zone_zone_code_not_blank CHECK (btrim(zone_code) <> ''),
  CONSTRAINT ck_inventory_zone_seen_order CHECK (last_seen_at >= first_seen_at)
);

CREATE TABLE IF NOT EXISTS inventory_rack (
  zone_code TEXT NOT NULL,
  rack_code TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT pk_inventory_rack PRIMARY KEY (zone_code, rack_code),
  CONSTRAINT fk_inventory_rack_zone FOREIGN KEY (zone_code)
    REFERENCES inventory_zone(zone_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT ck_inventory_rack_rack_code_not_blank CHECK (btrim(rack_code) <> ''),
  CONSTRAINT ck_inventory_rack_seen_order CHECK (last_seen_at >= first_seen_at)
);

CREATE TABLE IF NOT EXISTS inventory_node (
  node_id TEXT PRIMARY KEY,
  zone_code TEXT NOT NULL,
  rack_code TEXT NOT NULL,
  source_type TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT fk_inventory_node_rack FOREIGN KEY (zone_code, rack_code)
    REFERENCES inventory_rack(zone_code, rack_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT ck_inventory_node_id_not_blank CHECK (btrim(node_id) <> ''),
  CONSTRAINT ck_inventory_node_source_type CHECK (source_type IN ('edge_collector', 'simulator', 'unknown')),
  CONSTRAINT ck_inventory_node_seen_order CHECK (last_seen_at >= first_seen_at)
);

CREATE TABLE IF NOT EXISTS inventory_node_location_history (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL,
  zone_code TEXT NOT NULL,
  rack_code TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_inventory_node_location_history_node FOREIGN KEY (node_id)
    REFERENCES inventory_node(node_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_inventory_node_location_history_rack FOREIGN KEY (zone_code, rack_code)
    REFERENCES inventory_rack(zone_code, rack_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT ck_inventory_node_location_history_dates CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT ck_inventory_node_location_history_active_dates CHECK ((is_active = TRUE AND valid_to IS NULL) OR (is_active = FALSE))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_node_location_history_single_active
  ON inventory_node_location_history(node_id)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS telemetry_node (
  id BIGSERIAL PRIMARY KEY,
  event_time TIMESTAMPTZ NOT NULL,
  zone_code TEXT NOT NULL,
  rack_code TEXT NOT NULL,
  node_id TEXT NOT NULL,
  cpu_usage_pct NUMERIC(5, 2) NOT NULL,
  ram_usage_mb NUMERIC(12, 2) NOT NULL,
  net_rx_bytes_sec BIGINT NOT NULL,
  net_tx_bytes_sec BIGINT NOT NULL,
  out_of_order BOOLEAN NOT NULL DEFAULT FALSE,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_telemetry_node_rack FOREIGN KEY (zone_code, rack_code)
    REFERENCES inventory_rack(zone_code, rack_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_telemetry_node_node FOREIGN KEY (node_id)
    REFERENCES inventory_node(node_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT ck_telemetry_node_cpu_range CHECK (cpu_usage_pct >= 0 AND cpu_usage_pct <= 100),
  CONSTRAINT ck_telemetry_node_ram_non_negative CHECK (ram_usage_mb >= 0),
  CONSTRAINT ck_telemetry_node_net_rx_non_negative CHECK (net_rx_bytes_sec >= 0),
  CONSTRAINT ck_telemetry_node_net_tx_non_negative CHECK (net_tx_bytes_sec >= 0)
);

CREATE TABLE IF NOT EXISTS telemetry_environment (
  id BIGSERIAL PRIMARY KEY,
  event_time TIMESTAMPTZ NOT NULL,
  zone_code TEXT NOT NULL,
  rack_code TEXT NOT NULL,
  temperature_c NUMERIC(5, 2) NOT NULL,
  humidity_pct NUMERIC(5, 2) NOT NULL,
  out_of_order BOOLEAN NOT NULL DEFAULT FALSE,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_telemetry_environment_rack FOREIGN KEY (zone_code, rack_code)
    REFERENCES inventory_rack(zone_code, rack_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT ck_telemetry_environment_temperature_range CHECK (temperature_c >= -10 AND temperature_c <= 85),
  CONSTRAINT ck_telemetry_environment_humidity_range CHECK (humidity_pct >= 0 AND humidity_pct <= 100)
);

CREATE INDEX IF NOT EXISTS ix_telemetry_node_event_time ON telemetry_node(event_time DESC);
CREATE INDEX IF NOT EXISTS ix_telemetry_environment_event_time ON telemetry_environment(event_time DESC);
CREATE INDEX IF NOT EXISTS ix_telemetry_node_node_event_time ON telemetry_node(node_id, event_time DESC);
CREATE INDEX IF NOT EXISTS ix_inventory_node_last_seen_at ON inventory_node(last_seen_at DESC);

COMMIT;
