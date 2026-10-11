-- Esquema de TrastoMaldito (BD de laboratorio, datos ficticios).
-- Quien abra la BD debe activar PRAGMA foreign_keys = ON (seed.ts y el servidor lo hacen).

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  rut           TEXT NOT NULL UNIQUE,
  commune       TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  password_hash TEXT NOT NULL,
  store_credit  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE relics (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  price_clp   INTEGER NOT NULL CHECK (price_clp >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url   TEXT,
  published   INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1))
);

CREATE TABLE reviews (
  id         INTEGER PRIMARY KEY,
  relic_id   INTEGER NOT NULL REFERENCES relics(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE coupons (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  discount_pct INTEGER NOT NULL CHECK (discount_pct BETWEEN 1 AND 100)
);

CREATE TABLE coupon_redemptions (
  coupon_id INTEGER NOT NULL REFERENCES coupons(id),
  user_id   INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (coupon_id, user_id)
);

CREATE TABLE carts (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id),
  coupon_code TEXT REFERENCES coupons(code)
);

CREATE TABLE cart_items (
  cart_id  INTEGER NOT NULL REFERENCES carts(id),
  relic_id INTEGER NOT NULL REFERENCES relics(id),
  qty      INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (cart_id, relic_id)
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  total_clp   INTEGER NOT NULL CHECK (total_clp >= 0),
  coupon_code TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_items (
  order_id  INTEGER NOT NULL REFERENCES orders(id),
  relic_id  INTEGER NOT NULL REFERENCES relics(id),
  qty       INTEGER NOT NULL CHECK (qty > 0),
  price_clp INTEGER NOT NULL CHECK (price_clp >= 0)
);

-- A09: auditoría de seguridad. Solo se escribe con VULN_A09=off (vulns/a09.ts). Sin secretos.
CREATE TABLE audit_log (
  id      INTEGER PRIMARY KEY,
  ts      TEXT NOT NULL DEFAULT (datetime('now')),
  event   TEXT NOT NULL CHECK (event IN ('login_ok', 'login_failed', 'register', 'checkout_paid', 'payment_failed')),
  user_id INTEGER REFERENCES users(id),
  email   TEXT,
  ip      TEXT
);
