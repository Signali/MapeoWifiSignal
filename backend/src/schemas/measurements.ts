import { z } from 'zod';
import { bodyId } from './common.ts';

const POINT_ID = 'point_id es obligatorio y debe ser entero';
const PHASE = 'phase debe ser antes o despues';
const CLIENT_UUID = 'client_uuid es obligatorio y debe ser un UUID';
const READINGS = 'readings debe tener entre 1 y 100 lecturas';
const BSSID = 'bssid debe tener el formato aa:bb:cc:dd:ee:ff';
const SSID = 'ssid debe tener hasta 32 caracteres';
const RSSI = 'rssi_dbm debe ser un entero entre -120 y 0';
const FREQUENCY = 'frequency_mhz debe ser un entero entre 2400 y 7125';
const REPEATED_BSSID = 'Hay un bssid repetido en readings';
const MEASURED_AT = 'measured_at debe ser una fecha ISO 8601 con zona horaria';

// Una lectura (contrato §4). Se validan todas, aunque el service guarde solo las del SSID de
// la organización. El BSSID se guarda en minúsculas.
const reading = z.strictObject({
  bssid: z
    .string({ error: BSSID })
    .regex(/^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$/, BSSID)
    .transform((value) => value.toLowerCase()),
  ssid: z.string({ error: SSID }).max(32, SSID),
  rssi_dbm: z.number({ error: RSSI }).int(RSSI).min(-120, RSSI).max(0, RSSI),
  frequency_mhz: z.number({ error: FREQUENCY }).int(FREQUENCY).min(2400, FREQUENCY).max(7125, FREQUENCY),
});

// POST /measurements (contrato §6.15). `measured_at` es opcional; su rango (422) lo revisa el
// service, que es quien conoce la hora.
export const createMeasurementBody = z.strictObject({
  point_id: bodyId(POINT_ID),
  phase: z.enum(['antes', 'despues'], { error: PHASE }),
  client_uuid: z
    .string({ error: CLIENT_UUID })
    .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, CLIENT_UUID)
    .transform((value) => value.toLowerCase()),
  measured_at: z
    .string({ error: MEASURED_AT })
    .pipe(z.iso.datetime({ offset: true, error: MEASURED_AT }))
    .transform((value) => new Date(value))
    .optional(),
  readings: z
    .array(reading, { error: READINGS })
    .min(1, READINGS)
    .max(100, READINGS)
    .refine((list) => new Set(list.map((r) => r.bssid)).size === list.length, REPEATED_BSSID),
});
