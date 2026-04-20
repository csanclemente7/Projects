-- =============================================================================
-- INVENTARIO MACRIS - Schema de Base de Datos
-- Ejecutar en el SQL Editor de tu proyecto Supabase
-- =============================================================================

-- Tabla de ítems del inventario
CREATE TABLE IF NOT EXISTS inventory_items (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  manual_id     TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  description   TEXT,
  category      TEXT        NOT NULL CHECK (category IN ('consumible', 'vendible')),
  unit          TEXT        NOT NULL DEFAULT 'unidad',
  current_stock NUMERIC     NOT NULL DEFAULT 0,
  min_stock     NUMERIC     NOT NULL DEFAULT 0,
  cost_price    NUMERIC     NOT NULL DEFAULT 0,
  sale_price    NUMERIC,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Tabla de movimientos
CREATE TABLE IF NOT EXISTS inventory_movements (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  manual_id    TEXT        UNIQUE NOT NULL,
  item_id      UUID        REFERENCES inventory_items(id) NOT NULL,
  type         TEXT        NOT NULL CHECK (type IN ('entrada', 'salida', 'devolucion')),
  quantity     NUMERIC     NOT NULL CHECK (quantity > 0),
  unit_cost    NUMERIC     NOT NULL DEFAULT 0,
  unit_price   NUMERIC,
  notes        TEXT,
  reference    TEXT,
  worker_name  TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_movements_item_id    ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_type        ON inventory_movements(type);
CREATE INDEX IF NOT EXISTS idx_movements_created_at  ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_category        ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_items_is_active       ON inventory_items(is_active);

-- =============================================================================
-- RPC: Registrar movimiento de forma atómica
-- =============================================================================
CREATE OR REPLACE FUNCTION register_movement(
  p_item_id     UUID,
  p_manual_id   TEXT,
  p_type        TEXT,
  p_quantity    NUMERIC,
  p_unit_cost   NUMERIC,
  p_unit_price  NUMERIC  DEFAULT NULL,
  p_notes       TEXT     DEFAULT NULL,
  p_reference   TEXT     DEFAULT NULL,
  p_worker_name TEXT     DEFAULT NULL
)
RETURNS inventory_movements
LANGUAGE plpgsql
AS $$
DECLARE
  v_movement  inventory_movements;
  v_delta     NUMERIC;
  v_cur_stock NUMERIC;
BEGIN
  IF p_type IN ('entrada', 'devolucion') THEN
    v_delta := p_quantity;
  ELSIF p_type = 'salida' THEN
    v_delta := -p_quantity;
    SELECT current_stock INTO v_cur_stock FROM inventory_items WHERE id = p_item_id;
    IF v_cur_stock < p_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente. Disponible: %, Solicitado: %', v_cur_stock, p_quantity;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo inválido: %', p_type;
  END IF;

  INSERT INTO inventory_movements
    (manual_id, item_id, type, quantity, unit_cost, unit_price, notes, reference, worker_name)
  VALUES
    (p_manual_id, p_item_id, p_type, p_quantity, p_unit_cost, p_unit_price, p_notes, p_reference, p_worker_name)
  RETURNING * INTO v_movement;

  UPDATE inventory_items
  SET current_stock = current_stock + v_delta
  WHERE id = p_item_id;

  RETURN v_movement;
END;
$$;

-- =============================================================================
-- RLS - Acceso abierto (ajustar si se añade autenticación)
-- =============================================================================
ALTER TABLE inventory_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_items"     ON inventory_items;
DROP POLICY IF EXISTS "allow_all_movements" ON inventory_movements;
CREATE POLICY "allow_all_items"     ON inventory_items     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_movements" ON inventory_movements FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- Datos de ejemplo
-- =============================================================================
INSERT INTO inventory_items (manual_id, name, description, category, unit, current_stock, min_stock, cost_price, sale_price) VALUES
  ('INV-001', 'Tubería de cobre 1/4"',       'Tubería cobre para refrigeración',   'vendible',   'metro',  50, 10,   8500,   12000),
  ('INV-002', 'Tubería de cobre 3/8"',       'Tubería cobre para refrigeración',   'vendible',   'metro',  40, 10,  12000,   18000),
  ('INV-003', 'Aire acondicionado 9000 BTU', 'Mini-split 9000 BTU',                'vendible',   'unidad',  5,  2, 850000, 1200000),
  ('INV-004', 'Aire acondicionado 12000 BTU','Mini-split 12000 BTU',               'vendible',   'unidad',  4,  2,1100000, 1600000),
  ('INV-005', 'Aire acondicionado 18000 BTU','Mini-split 18000 BTU',               'vendible',   'unidad',  3,  1,1500000, 2200000),
  ('INV-006', 'Cable eléctrico #12',         'Cable THHN calibre 12',              'vendible',   'metro', 200, 30,   2800,    4200),
  ('INV-007', 'Capacitor 35/5 MFD',          'Capacitor dual para compresor',      'vendible',   'unidad', 15,  5,  28000,   55000),
  ('INV-008', 'Gas refrigerante R-410A',     'Cilindro R-410A 11.3 kg',            'vendible',   'kg',     30,  5,  95000,  145000),
  ('INV-009', 'Cinta aislante',              'Rollo cinta aislante 18mm',          'consumible', 'rollo',  20,  5,   3500,    NULL),
  ('INV-010', 'Cinta de teflón',             'Cinta teflón para conexiones',       'consumible', 'rollo',  30,  8,   1500,    NULL),
  ('INV-011', 'Soldadura de plata',          'Varilla soldadura plata 5%',         'consumible', 'kg',      3,  1, 180000,    NULL),
  ('INV-012', 'Lija de agua #400',           'Lija para limpieza de contactos',    'consumible', 'pliego', 50, 10,   1200,    NULL)
ON CONFLICT (manual_id) DO NOTHING;