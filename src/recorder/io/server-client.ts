/**
 * Same-origin client for the provjup server extension (`provjup/api/routes.py`).
 *
 * The frontend talks only to its own Jupyter server (recorder PRD NG2). Every method returns
 * a value instead of throwing, so a server problem never takes recording down with it.
 */

import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

export interface ManifestFile {
  /** Folder holding the manifest, relative to the server root; `''` is the root. */
  dir: string;
  name: string;
  text: string;
}

export interface HostFacts {
  hostname: string;
  username: string;
  platform: string;
}

export type AppendResult =
  | { kind: 'ok'; size: number }
  | { kind: 'offset_mismatch'; size: number }
  | { kind: 'error'; message: string };

export type FetchResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** The server operations the recorder uses. Tests implement this with a fake. */
export interface ProvjupServer {
  listManifests(): Promise<FetchResult<ManifestFile[]>>;
  appendLog(dir: string, file: string, offset: number, data: string): Promise<AppendResult>;
  hostFacts(): Promise<FetchResult<HostFacts>>;
}

function isManifestFile(value: unknown): value is ManifestFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['dir'] === 'string' && typeof v['name'] === 'string' && typeof v['text'] === 'string'
  );
}

function isHostFacts(value: unknown): value is HostFacts {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['hostname'] === 'string' &&
    typeof v['username'] === 'string' &&
    typeof v['platform'] === 'string'
  );
}

export class ServerClient implements ProvjupServer {
  constructor(private readonly settings: ServerConnection.ISettings) {}

  async listManifests(): Promise<FetchResult<ManifestFile[]>> {
    const body = await this.request('manifests', { method: 'GET' });
    if (!body.ok) return body;
    const list = (body.value as { manifests?: unknown }).manifests;
    if (!Array.isArray(list) || !list.every(isManifestFile)) {
      return { ok: false, message: 'malformed manifests response' };
    }
    return { ok: true, value: list };
  }

  async appendLog(dir: string, file: string, offset: number, data: string): Promise<AppendResult> {
    let response: Response;
    try {
      response = await ServerConnection.makeRequest(
        URLExt.join(this.settings.baseUrl, 'provjup', 'log', 'append'),
        { method: 'POST', body: JSON.stringify({ dir, file, offset, data }) },
        this.settings,
      );
    } catch (error) {
      return { kind: 'error', message: String(error) };
    }
    const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const size = parsed?.['size'];
    if (response.status === 200 && typeof size === 'number') return { kind: 'ok', size };
    if (response.status === 409 && typeof size === 'number')
      return { kind: 'offset_mismatch', size };
    const message =
      typeof parsed?.['error'] === 'string' ? parsed['error'] : `HTTP ${response.status}`;
    return { kind: 'error', message };
  }

  async hostFacts(): Promise<FetchResult<HostFacts>> {
    const body = await this.request('host', { method: 'GET' });
    if (!body.ok) return body;
    return isHostFacts(body.value)
      ? { ok: true, value: body.value }
      : { ok: false, message: 'malformed host response' };
  }

  private async request(path: string, init: RequestInit): Promise<FetchResult<unknown>> {
    try {
      const response = await ServerConnection.makeRequest(
        URLExt.join(this.settings.baseUrl, 'provjup', path),
        init,
        this.settings,
      );
      if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
      return { ok: true, value: (await response.json()) as unknown };
    } catch (error) {
      return { ok: false, message: String(error) };
    }
  }
}
