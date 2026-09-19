let csrf = "";
export async function initSession() {
  csrf = (await (await fetch("/api/session")).json()).csrf;
}
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const form = data instanceof FormData;
  const response = await fetch("/api" + path, {
    method,
    headers: {
      ...(data && !form ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-Tracework-CSRF": csrf } : {}),
    },
    body: data === undefined ? undefined : form ? data : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `${result.error?.message || "Request failed"}${result.error?.code ? " [" + result.error.code + "]" : ""}`,
    );
  return result;
}
export const uid = () => crypto.randomUUID();
