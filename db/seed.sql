-- =============================================================================
-- SignalMap — datos de ejemplo (Hitos 2 y 3). SOLO desarrollo y demo.
--
-- Lo ejecuta `npm run seed` (backend/scripts/seed.ts) dentro de una transacción,
-- y después ese script crea los usuarios con las claves del .env. Este archivo
-- no lleva usuarios ni claves. El nombre de la red WiFi de la organización
-- llega por la variable SEED_WIFI_SSID: seed.ts la fija en la transacción
-- (set_config) y aquí se lee con current_setting.
--
-- Resetea: vacía las 9 tablas y reinicia los IDs, así cada corrida deja el mismo
-- estado (P-07 = id 7). Borra todo lo creado por la API: nunca correrlo en un
-- entorno real. Sin mediciones: los puntos quedan «sin medir» para la demo.
-- =============================================================================

TRUNCATE organizations, email_domains, users, buildings, floors, points, user_buildings,
         measurements, network_readings
    RESTART IDENTITY;

INSERT INTO organizations (name, wifi_ssid)
VALUES ('Inmobiliaria Norte', current_setting('signalmap.wifi_ssid'));

-- Dominio corporativo de la organización: sus usuarios deben usarlo.
INSERT INTO email_domains (domain, kind, org_id)
SELECT 'demo.cl', 'corporativo', id FROM organizations WHERE name = 'Inmobiliaria Norte';

-- Torre Norte: el edificio medido (con piso y puntos; borrarlo da 409).
-- Oficinas Centro: sin pisos ni asignación al cliente (el cliente recibe 404).
INSERT INTO buildings (org_id, name)
SELECT id, 'Torre Norte' FROM organizations WHERE name = 'Inmobiliaria Norte';
INSERT INTO buildings (org_id, name)
SELECT id, 'Oficinas Centro' FROM organizations WHERE name = 'Inmobiliaria Norte';

INSERT INTO floors (building_id, name, width_m, height_m)
SELECT id, 'Piso 3', 40.00, 25.00 FROM buildings WHERE name = 'Torre Norte';

-- 24 puntos en 6 columnas x 4 filas, recorridas en zigzag (bajando y subiendo
-- por columna). P-07 coincide con el ejemplo del contrato: (12.5, 8.0).
-- P-07, P-08 y P-09 llevan el UID de las 3 tiras NFC reales; el resto, UID inventados.
INSERT INTO points (floor_id, code, x, y, nfc_uid)
SELECT f.id, p.code, p.x, p.y, p.nfc_uid
FROM floors f
JOIN buildings b ON b.id = f.building_id
CROSS JOIN (VALUES
    ('P-01',  6.00,  2.00, '04A23B1C5D7A80'),
    ('P-02',  6.00,  8.00, '04A23B1C5D7B80'),
    ('P-03',  6.00, 14.00, '04A23B1C5D7C80'),
    ('P-04',  6.00, 20.00, '04A23B1C5D7D80'),
    ('P-05', 12.50, 20.00, '04A23B1C5D7E80'),
    ('P-06', 12.50, 14.00, '04A23B1C5D7F80'),
    ('P-07', 12.50,  8.00, '04C7DC7FBF2A81'),
    ('P-08', 12.50,  2.00, '04D3DC7FBF2A81'),
    ('P-09', 19.00,  2.00, '04D2DC7FBF2A81'),
    ('P-10', 19.00,  8.00, '04A23B1C5D8380'),
    ('P-11', 19.00, 14.00, '04A23B1C5D8480'),
    ('P-12', 19.00, 20.00, '04A23B1C5D8580'),
    ('P-13', 25.50, 20.00, '04A23B1C5D8680'),
    ('P-14', 25.50, 14.00, '04A23B1C5D8780'),
    ('P-15', 25.50,  8.00, '04A23B1C5D8880'),
    ('P-16', 25.50,  2.00, '04A23B1C5D8980'),
    ('P-17', 32.00,  2.00, '04A23B1C5D8A80'),
    ('P-18', 32.00,  8.00, '04A23B1C5D8B80'),
    ('P-19', 32.00, 14.00, '04A23B1C5D8C80'),
    ('P-20', 32.00, 20.00, '04A23B1C5D8D80'),
    ('P-21', 38.50, 20.00, '04A23B1C5D8E80'),
    ('P-22', 38.50, 14.00, '04A23B1C5D8F80'),
    ('P-23', 38.50,  8.00, '04A23B1C5D9080'),
    ('P-24', 38.50,  2.00, '04A23B1C5D9180')
) AS p(code, x, y, nfc_uid)
WHERE b.name = 'Torre Norte' AND f.name = 'Piso 3'
ORDER BY p.code;
