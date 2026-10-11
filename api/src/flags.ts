export const VULN_IDS = ['W1','W2','W3','W4','W5','W6','A1','A2','A3','A4','A5','A07','A09','API4','API5'] as const;
export type VulnId = typeof VULN_IDS[number];
export function loadFlags(env: Record<string,string|undefined> = process.env): Readonly<Record<VulnId, boolean>> {
  const out = {} as Record<VulnId, boolean>;
  for (const id of VULN_IDS) {
    const v = env[`VULN_${id}`];
    if (v !== undefined && v !== 'on' && v !== 'off') throw new Error(`VULN_${id} debe ser 'on' u 'off', recibió '${v}'`);
    out[id] = v === 'on';
  }
  return Object.freeze(out);
}
export const flags = loadFlags();
