// src/features/printers/BambuService.ts
import { j, BACKEND } from '@/lib/http';

export type BridgePrinter = {
  name: string;
  host: string;
  serial?: string;
  connected: boolean;
  last_error?: string | null;
};

export type BridgeStatus = {
  name: string;
  host?: string;
  serial?: string;
  connected: boolean;
  // Optional blobs that may be returned by the bridge/pybambu
  get_version?: unknown;
  push_all?: unknown;
  note?: string;
};

export type StartPrintBody =
  | { gcode_url: string; start?: boolean; copy_to_sd?: boolean }
  | { '3mf_url': string; start?: boolean; copy_to_sd?: boolean };

const base = `${BACKEND}/bambu/bridge`;

function p(name: string, suffix = ''): string {
  return `${base}/${encodeURIComponent(name)}${suffix}`;
}

export const Bambu = {
  listPrinters: () =>
    j<BridgePrinter[]>(fetch(`${base}/printers`)),

  connect: (name: string) =>
    j<{ ok: true; name: string }>(fetch(p(name, '/connect'), { method: 'POST' })),

  status: (name: string) =>
    j<BridgeStatus>(fetch(p(name, '/status'))),

  startPrint: (name: string, body: StartPrintBody) =>
    j<unknown>(
      fetch(p(name, '/print'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    ),

  pause: (name: string) =>
    j<unknown>(fetch(p(name, '/pause'), { method: 'POST' })),

  resume: (name: string) =>
    j<unknown>(fetch(p(name, '/resume'), { method: 'POST' })),

  stop: (name: string) =>
    j<unknown>(fetch(p(name, '/stop'), { method: 'POST' })),

  cameraUrl: (name: string) => p(name, '/camera'),
};

export default Bambu;
