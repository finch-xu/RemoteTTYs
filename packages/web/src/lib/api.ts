function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)rttys-csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  return fetch(url, { ...options, headers });
}
