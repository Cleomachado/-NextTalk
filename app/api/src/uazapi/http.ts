import { config } from "../config.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

// Camada HTTP base da UazAPI: injeta o header `token`, trata erro e faz parse.
export class UazHttp {
  constructor(
    private readonly baseUrl = config.uazapi.url,
    private readonly token = config.uazapi.token,
  ) {}

  async req<T = any>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: { "Content-Type": "application/json", token: this.token },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const raw = await res.text();
    let json: any;
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = { _raw: raw };
    }
    if (!res.ok) {
      const msg = json?.error || json?.message || raw || res.statusText;
      throw new Error(`UazAPI ${method} ${path} (HTTP ${res.status}): ${msg}`);
    }
    return json as T;
  }
}
