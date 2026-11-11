import { type ReadScope, VISIBLE } from './buildings.ts';
import { query } from './db.ts';

export type MeasurementRow = {
  id: number;
  point_id: number;
  phase: 'antes' | 'despues';
  measured_at: Date;
  voided_at: Date | null;
  void_reason: string | null;
};
export type ReadingRow = { measurement_id: number; bssid: string; ssid: string; rssi_dbm: number; frequency_mhz: number };
export type NewReading = Omit<ReadingRow, 'measurement_id'>;
export type NewMeasurement = { point_id: number; user_id: number; phase: string; client_uuid: string; measured_at: Date };

const COLUMNS = 'm.id, m.point_id, m.phase, m.measured_at, m.voided_at, m.void_reason';
// Una medición llega a su organización por punto → piso → edificio.
const FROM_POINT = 'FROM measurements m JOIN points p ON p.id = m.point_id JOIN floors f ON f.id = p.floor_id JOIN buildings b ON b.id = f.building_id';

// Solo para decidir entre 200 y 409 al reenviar un client_uuid: el org_id no sale del service.
export async function findByClientUuid(uuid: string): Promise<(MeasurementRow & { org_id: number }) | undefined> {
  const { rows } = await query<MeasurementRow & { org_id: number }>(
    `SELECT ${COLUMNS}, b.org_id ${FROM_POINT} WHERE m.client_uuid = $1`,
    [uuid],
  );
  return rows[0];
}

// Una sola sentencia: la medición y sus lecturas entran juntas o no entra nada. undefined si
// el client_uuid ya existía (dos envíos iguales a la vez): el service lee la ya guardada.
export async function insert(m: NewMeasurement, readings: NewReading[]): Promise<MeasurementRow | undefined> {
  const { rows } = await query<MeasurementRow>(
    `WITH m AS (
       INSERT INTO measurements (point_id, user_id, phase, client_uuid, measured_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_uuid) DO NOTHING
       RETURNING id, point_id, phase, measured_at, voided_at, void_reason),
     r AS (
       INSERT INTO network_readings (measurement_id, bssid, ssid, rssi_dbm, frequency_mhz)
       SELECT m.id, x.bssid, x.ssid, x.rssi_dbm, x.frequency_mhz
       FROM m, jsonb_to_recordset($6::jsonb) AS x(bssid text, ssid text, rssi_dbm smallint, frequency_mhz integer))
     SELECT * FROM m`,
    [m.point_id, m.user_id, m.phase, m.client_uuid, m.measured_at, JSON.stringify(readings)],
  );
  return rows[0];
}

// Visible si lo es el edificio de su punto; también devuelve las anuladas.
export async function findById(id: number, scope: ReadScope): Promise<MeasurementRow | undefined> {
  const { rows } = await query<MeasurementRow>(`SELECT ${COLUMNS} ${FROM_POINT} WHERE ${VISIBLE} AND m.id = $3`, [
    scope.orgId,
    scope.assignedTo,
    id,
  ]);
  return rows[0];
}

export async function readingsOf(ids: number[]): Promise<ReadingRow[]> {
  const { rows } = await query<ReadingRow>(
    `SELECT measurement_id, bssid, ssid, rssi_dbm, frequency_mhz FROM network_readings
     WHERE measurement_id = ANY($1) ORDER BY measurement_id, rssi_dbm DESC, bssid`,
    [ids],
  );
  return rows;
}
