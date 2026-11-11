import { query } from './db.ts';

// Nombre exacto de la red WiFi de la organización: define qué lecturas se guardan.
export async function wifiSsidOf(orgId: number): Promise<string> {
  const { rows } = await query<{ wifi_ssid: string }>('SELECT wifi_ssid FROM organizations WHERE id = $1', [orgId]);
  return rows[0].wifi_ssid;
}
