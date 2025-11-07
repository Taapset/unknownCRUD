import axios, { AxiosHeaders, AxiosRequestConfig } from "axios";

const baseURL =
  import.meta.env.VITE_API_BASE?.toString() ??
  import.meta.env.VITE_API_BASE_URL?.toString() ??
  "http://localhost:8000";

export const API_BASE_URL = baseURL;

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000,
});

let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

async function fetchCsrfToken(): Promise<string | null> {
  try {
    const { data } = await apiClient.get<{ csrfToken?: string; csrf_token?: string }>(
      "/auth/csrf",
      { headers: { "cache-control": "no-cache" } },
    );
    csrfToken = data.csrfToken ?? data.csrf_token ?? null;
  } catch (error) {
    csrfToken = null;
    throw error;
  } finally {
    csrfPromise = null;
  }
  return csrfToken;
}

export function getCsrfToken(force = false): Promise<string | null> {
  if (!force && csrfToken) {
    return Promise.resolve(csrfToken);
  }
  if (!csrfPromise) {
    csrfPromise = fetchCsrfToken();
  }
  return csrfPromise;
}

function needsCsrf(config: AxiosRequestConfig): boolean {
  const method = (config.method ?? "get").toUpperCase();
  return !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method);
}

apiClient.interceptors.request.use(async (config) => {
  if (needsCsrf(config)) {
    try {
      const token = await getCsrfToken();
      if (token) {
        if (!config.headers) {
          config.headers = new AxiosHeaders();
        }
        if (config.headers instanceof AxiosHeaders) {
          config.headers.set("x-csrf-token", token);
        } else {
          (config.headers as Record<string, unknown>)["x-csrf-token"] = token;
        }
      }
    } catch (error) {
      console.warn("Unable to refresh CSRF token", error);
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 403 &&
      error.config
    ) {
      const originalConfig = error.config as (typeof error.config) & {
        _retry?: boolean;
      };
      if (originalConfig._retry) {
        return Promise.reject(error);
      }
      originalConfig._retry = true;
      try {
        await getCsrfToken(true);
        return apiClient.request(originalConfig);
      } catch (retryError) {
        return Promise.reject(retryError);
      }
    }
    return Promise.reject(error);
  },
);

export function formatError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { detail?: unknown } | undefined;
    const detail = payload?.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (!item) {
            return null;
          }
          if (typeof item === "string") {
            return item;
          }
          if (typeof item === "object" && "msg" in item && item.msg) {
            return String((item as { msg: unknown }).msg);
          }
          return JSON.stringify(item);
        })
        .filter(Boolean);
      if (messages.length) {
        return messages.join("; ");
      }
    }
    if (detail && typeof detail === "object") {
      if ("message" in (detail as Record<string, unknown>)) {
        const message = (detail as { message?: unknown }).message;
        if (message) {
          return String(message);
        }
      }
      return JSON.stringify(detail);
    }
    return error.message ?? "Unexpected request error";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
