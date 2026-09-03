import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getSessionUser,
  hasRealSession,
  restoreRealSession,
  setAccessToken,
} from "@/lib/auth-store";
import {
  demoUsers,
  emitEvent,
  emitTyping,
  eventLog,
  mockApi,
  mockDashboard,
  mockDb,
  mockReports,
  testRules,
} from "@/lib/mock";
import type {
  ApiErrorCode,
  CannedResponse,
  ErrorEnvelope,
  InboxScope,
  InviteSummary,
  SessionUser,
  Ticket,
  WidgetAttachment,
} from "@/lib/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

/** In-flight GET request dedup map — collapses concurrent identical GETs
 *  into a single network request. Entries are removed on resolution. */
const inflightGet = new Map<string, Promise<unknown>>();

/** Persistent GET response cache — serves stale data instantly while
 *  revalidating in the background. Entries expire after `TTL_MS`. */
const GET_CACHE_TTL_MS = 30_000; // 30 seconds
const getCache = new Map<string, { data: unknown; ts: number }>();

/**
 * Real backend is the default. Set NEXT_PUBLIC_API_MOCK=true only if you explicitly want mock data.
 */
export const USE_MOCK = process.env.NEXT_PUBLIC_API_MOCK === "true";

/**
 * Build a WebSocket URL for a backend WS path. Backend sockets live under
 * `/ws` (NOT under the `/api` prefix), so the `/api` suffix is stripped from
 * an absolute API_BASE; a relative API_BASE falls back to this origin.
 */
export function wsEndpoint(path: string): string {
  const proto =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  let host = typeof window !== "undefined" ? `${window.location.hostname}:8000` : "localhost:8000";
  if (API_BASE.startsWith("http")) {
    try {
      const u = new URL(API_BASE);
      host = u.host;
    } catch {
      host = API_BASE.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    }
  }
  const cleanPath = path.replace(/^.*\/ws\//, "/ws/");
  const p = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return `${proto}://${host}${p}`;
}

/**
 * Build an absolute URL for a backend-served static path (e.g. /static/uploads/...).
 * Backend static files are served from the API origin without the /api prefix,
 * so that suffix is stripped from an absolute API_BASE.
 */
export function staticUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  if (!API_BASE.startsWith("http")) {
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }
  const base = API_BASE.replace(/\/+$/, "").replace(/\/api$/, "");
  return `${base}${path}`;
}

export class ApiClientError extends Error {
  code?: ApiErrorCode;
  requestId?: string;
  status?: number;

  constructor(message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; fresh?: boolean } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  if (USE_MOCK) return mockRoute<T>(method, path, options.body);

  // Deduplicate concurrent identical GET requests + serve from cache
  if (method === "GET" && !options.fresh) {
    const cached = getCache.get(path);
    const now = Date.now();
    // If we have a fresh cache hit, return immediately
    if (cached && now - cached.ts < GET_CACHE_TTL_MS) {
      // Also dedup concurrent requests
      const existing = inflightGet.get(path);
      if (existing) return existing as Promise<T>;
      return cached.data as T;
    }
    // If there's an in-flight request, wait for it
    const existing = inflightGet.get(path);
    if (existing) return existing as Promise<T>;
    const p = realRequest<T>(path, options)
      .then((data) => {
        getCache.set(path, { data, ts: Date.now() });
        return data;
      })
      .finally(() => inflightGet.delete(path));
    inflightGet.set(path, p);
    return p;
  }
  // Invalidate cache entries that may be affected by mutations.
  // After any write, related GET caches are cleared so the next fetch
  // hits the network and gets fresh data.
  if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
    const prefix = path.split("?")[0].replace(/\/\d+$/, "").replace(/\/[^/]+$/, "");
    for (const key of getCache.keys()) {
      if (key === path || key.startsWith(prefix)) {
        getCache.delete(key);
      }
    }
  }
  return realRequest<T>(path, options);
}

export const api = {
  get: <T>(path: string, opts?: { fresh?: boolean }) => apiRequest<T>(path, { fresh: opts?.fresh }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

/* ------------------------------------------------------------------ */
/* Real backend path (error envelope per guide §8)                     */
/* ------------------------------------------------------------------ */

async function realRequest<T>(
  path: string,
  options: { method?: string; body?: unknown },
): Promise<T> {
  const method = options.method ?? "GET";
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  let body: BodyInit | null | undefined;
  if (options.body === undefined) body = undefined;
  else if (isForm) body = options.body as FormData;
  else body = JSON.stringify(options.body);

  const run = (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        // For multipart bodies the browser sets Content-Type (with the boundary).
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });

  let res = await run(getAccessToken());

  // Single 401 → try to refresh the access token and retry once (§6.1).
  // Impersonation tokens are short-lived and non-refreshable — never refresh
  // them; if one expires mid-session, drop back into the real session.
  if (res.status === 401) {
    const token = getAccessToken();
    const impersonating = hasRealSession();
    const next = token && !impersonating ? await refreshAccessToken() : null;
    if (next) res = await run(next);
    else if (token) {
      if (impersonating) restoreRealSession();
      else clearSession();
    }
  }

  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => null)) as T | ErrorEnvelope | null;
  if (res.ok) return data as T;

  const env = data as ErrorEnvelope | null;
  const err = new ApiClientError(env?.error?.message ?? "Request failed");
  err.code = env?.error?.code;
  err.requestId = env?.error?.details?.request_id;
  err.status = res.status;
  throw err;
}

/** POST /auth/refresh — rotates the access token. Returns null on failure
 * (session is then considered expired; callers surface the 401). */
async function refreshAccessToken(): Promise<string | null> {
  const token = getRefreshToken() ?? getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      access_token?: string;
      token?: string;
    } | null;
    const next = data?.access_token ?? data?.token ?? null;
    if (next) setAccessToken(next);
    return next;
  } catch {
    return null;
  }
}

/** True when the JWT is missing, unreadable, or expires within `bufferMs`. */
export function jwtExpiresSoon(token: string, bufferMs: number): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { exp?: number };
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp)) return true;
    return Date.now() / 1000 + bufferMs / 1000 >= exp;
  } catch {
    return true;
  }
}

/** Returns a non-expired access token, refreshing it via POST /auth/refresh when
 *  the stored one is missing or about to expire. Null when unavailable — callers
 *  that need auth should treat null as "not connected". */
export async function ensureFreshAccessToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;
  if (!jwtExpiresSoon(token, 30_000)) return token;
  try {
    return await refreshAccessToken();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Mock route table — maps REST paths onto the prototype dataset       */
/* ------------------------------------------------------------------ */

async function mockRoute<T>(method: string, path: string, body?: unknown): Promise<T> {
  const normalized = path.replace(/^\/+/, "").replace(/^api\//, "");
  const [head, ...rest] = normalized.split("/").filter(Boolean);

  switch (head) {
    case "auth":
      return (await mockAuth(rest, body)) as T;
    case "impersonate":
      return (await mockImpersonate(rest[0])) as T;
    case "tenants":
      return (await mockTenants(method, rest, body)) as T;
    case "agents":
      return (await mockAgents(method, rest, body)) as T;
    case "teams":
      return (await mockTeams(method, rest, body)) as T;
    case "labels":
      return (await mockLabels(method, rest, body)) as T;
    case "tickets":
      return (await mockTickets(method, rest, body)) as T;
    case "articles":
      return (await mockArticles(method, rest, body)) as T;
    case "canned":
      return (await mockCanned(method, rest, body)) as T;
    case "rules":
      return (await mockRules(method, rest, body)) as T;
    case "plans":
      if (method === "PUT" || method === "PATCH") {
        const code = rest[0] as Parameters<typeof mockApi.updatePlan>[0];
        return (await mockApi.updatePlan(code, (body ?? {}) as Record<string, unknown>)) as T;
      }
      return (await mockApi.plans()) as T;
    case "invoices":
      return (await mockApi.invoices()) as T;
    case "audit":
      return (await mockApi.audit()) as T;
    case "automations":
      return (await mockAutomations(method, rest, body)) as T;
    case "sla":
      return (await mockSla(method, rest, body)) as T;
    case "webhooks":
      return (await mockWebhooks(method, rest, body)) as T;
    case "channels":
      return (await mockChannels(method, rest, body)) as T;
    case "api-keys":
      return (await mockApiKeys(method, rest, body)) as T;
    case "feature-flags":
      return (await mockFeatureFlags(method, rest, body)) as T;
    case "presets":
      return (await mockPresets(method, rest, body)) as T;
    case "notifications":
      return (await mockNotifications(method, rest, body)) as T;
    case "platform-feed":
      return (await mockApi.feed("super_admin")) as T;
    case "past-tickets":
      return (await mockApi.pastTickets((body as { email?: string })?.email)) as T;
    case "portal":
      return (await mockPortal(method, rest, body, path)) as T;
    case "events":
      return eventLog() as T;
    case "profile":
      return (await mockApi.updateProfile(
        (body ?? {}) as Parameters<typeof mockApi.updateProfile>[0],
      )) as T;
    case "knowledge":
      return (await mockKnowledge(method, rest, body)) as T;
    case "crawl":
      if (method === "POST") {
        const { url, maxPages } = (body ?? {}) as { url?: string; maxPages?: number };
        if (!url || !/^https?:\/\/\S+/.test(url)) {
          const err = new ApiClientError("Enter a valid http(s) URL to crawl.");
          err.code = "VALIDATION_ERROR";
          throw err;
        }
        return (await mockApi.crawlSite(
          getSessionUser()?.tenantId ?? "t1",
          url,
          maxPages ?? 15,
        )) as T;
      }
    case "faqs":
      return (await mockFaqs(method, rest, body, path)) as T;
    case "dashboard":
      return (await mockDashboard(getSessionUser()?.role ?? "owner")) as T;
    case "reports":
      return (await mockReports(getSessionUser()?.role ?? "owner")) as T;
    case "widget":
      if (method === "POST" && rest[0] === "send") {
        const { tenantId, sessionId, text, email, cust, stream, attachments } = (body ?? {}) as {
          tenantId?: string;
          sessionId?: string | null;
          text?: string;
          email?: string;
          cust?: string;
          stream?: boolean;
          attachments?: WidgetAttachment[];
        };
        if (!tenantId || (!text?.trim() && (!attachments || attachments.length === 0))) {
          const err = new ApiClientError("tenantId and text are required.");
          err.code = "VALIDATION_ERROR";
          throw err;
        }
        return (await mockApi.widgetSend({
          tenantId,
          sessionId: sessionId ?? null,
          text: text ?? "",
          email,
          cust,
          stream,
          attachments,
        })) as T;
      }
      if (method === "POST" && rest[0] === "persist") {
        const { ticketId, text } = (body ?? {}) as { ticketId?: string; text?: string };
        if (!ticketId || !text) {
          const err = new ApiClientError("ticketId and text are required.");
          err.code = "VALIDATION_ERROR";
          throw err;
        }
        return (await mockApi.persistWidgetReply(ticketId, text)) as T;
      }
      if (method === "POST" && rest[0] === "rating") {
        const { ticketId, rating, comment } = (body ?? {}) as {
          ticketId?: string;
          rating?: number;
          comment?: string;
        };
        if (!ticketId || typeof rating !== "number") {
          const err = new ApiClientError("ticketId and rating are required.");
          err.code = "VALIDATION_ERROR";
          throw err;
        }
        return (await mockApi.rateTicket(ticketId, rating, comment)) as T;
      }
      if (method === "GET" && rest[0] === "messages") {
        const query = (path ?? "").split("?")[1] ?? "";
        const ticketId = new URLSearchParams(query).get("ticketId") ?? "";
        if (!ticketId) {
          const err = new ApiClientError("ticketId is required.");
          err.code = "VALIDATION_ERROR";
          throw err;
        }
        return (await mockApi.widgetMessages(ticketId)) as T;
      }
      if (method === "POST" && rest[0] === "typing") {
        const { ticketId } = (body ?? {}) as { ticketId?: string };
        if (!ticketId) {
          const err = new ApiClientError("ticketId is required.");
          err.code = "VALIDATION_ERROR";
          throw err;
        }
        emitTyping(ticketId);
        return {} as T;
      }
      {
        const err = new ApiClientError(`Mock widget route not implemented: ${path}`);
        err.code = "NOT_FOUND";
        throw err;
      }
    default: {
      const err = new ApiClientError(`Mock route not implemented: ${path}`);
      err.code = "NOT_FOUND";
      throw err;
    }
  }
}

/** Mock impersonation — swap to the tenant's owner session (role owner). */
async function mockImpersonate(tenantId: string | undefined): Promise<unknown> {
  if (!tenantId) {
    const err = new ApiClientError("tenantId is required.");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const owner =
    mockDb.agents.find((a) => a.tenantId === tenantId && a.role === "owner") ??
    mockDb.agents.find((a) => a.role === "owner");
  if (!owner) {
    const err = new ApiClientError("Tenant has no active owner account.");
    err.code = "NOT_FOUND";
    throw err;
  }
  const user: SessionUser = {
    id: owner.id,
    email: owner.email,
    fullName: owner.name,
    role: "owner",
    tenantId: owner.tenantId ?? tenantId,
    initials: owner.initials,
    color: owner.color,
  };
  return { token: `mock-token-${owner.id}`, user };
}

async function mockAuth(rest: string[], body?: unknown): Promise<unknown> {  if (rest[0] === "login") {
    const { email, password } = (body ?? {}) as { email?: string; password?: string };
    const demo =
      demoUsers.find((u) => u.email === email && u.password === password) ??
      mockDb.registeredUsers.find((u) => u.email === email && u.password === password);
    if (!demo) {
      const err = new ApiClientError("Invalid email or password.");
      err.code = "UNAUTHORIZED";
      throw err;
    }
    const user: SessionUser = {
      id: demo.id,
      email: demo.email,
      fullName: demo.fullName,
      role: demo.role,
      tenantId: demo.tenantId,
      initials: demo.initials,
      color: demo.color,
    };
    return { token: `mock-token-${demo.id}`, user };
  }
  if (rest[0] === "register") {
    const { full_name, email, password, tenant_id } = (body ?? {}) as {
      full_name?: string;
      email?: string;
      password?: string;
      tenant_id?: string;
    };
    if (!full_name?.trim() || !email?.trim() || !password) {
      const err = new ApiClientError("Full name, email and password are required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    if (password.length < 6) {
      const err = new ApiClientError("Password must be at least 6 characters.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    const normalized = email.trim().toLowerCase();
    const taken =
      demoUsers.some((u) => u.email.toLowerCase() === normalized) ||
      mockDb.registeredUsers.some((u) => u.email.toLowerCase() === normalized);
    if (taken) {
      const err = new ApiClientError("An account with this email already exists.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.registerCustomer({
      fullName: full_name,
      email: normalized,
      password,
      tenantId: tenant_id ?? "t1",
    });
  }
  if (rest[0] === "me") {
    return { user: mockDb.user };
  }
  if (rest[0] === "forgot-password") {
    const { email } = (body ?? {}) as { email?: string };
    if (!email || !email.includes("@")) {
      const err = new ApiClientError("Enter a valid email address.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    const result = await mockApi.forgotPassword(email.trim().toLowerCase());
    return result;
  }
  if (rest[0] === "reset-info") {
    const summary = await mockApi.resetInfo(rest[1] ?? "");
    if (!summary) {
      const err = new ApiClientError("This reset link has expired or is invalid.");
      err.code = "RESET_TOKEN_EXPIRED";
      throw err;
    }
    return summary;
  }
  if (rest[0] === "reset-password") {
    const { token, new_password } = (body ?? {}) as { token?: string; new_password?: string };
    if (!token || !new_password) {
      const err = new ApiClientError("Token and new password are required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    if (new_password.length < 6) {
      const err = new ApiClientError("Password must be at least 6 characters.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    const result = await mockApi.resetPassword(token, new_password);
    if (!result) {
      const err = new ApiClientError("This reset link has expired or is invalid.");
      err.code = "RESET_TOKEN_EXPIRED";
      throw err;
    }
    return result;
  }
  if (rest[0] === "invites") {
    const summary: InviteSummary | null = await mockApi.inviteInfo(rest[1] ?? "");
    if (!summary) {
      const err = new ApiClientError("This invite link has expired or is invalid.");
      err.code = "INVITE_EXPIRED";
      throw err;
    }
    return summary;
  }
  if (rest[0] === "accept-invite") {
    const { invite_token, password, full_name } = (body ?? {}) as {
      invite_token?: string;
      password?: string;
      full_name?: string;
    };
    if (!invite_token || !password || !full_name) {
      const err = new ApiClientError("Full name, password and invite token are required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    const result = await mockApi.acceptInvite(invite_token, {
      fullName: full_name,
      password,
    });
    if (!result) {
      const err = new ApiClientError("This invite link has expired or is invalid.");
      err.code = "INVITE_EXPIRED";
      throw err;
    }
    return result;
  }
  const err = new ApiClientError(`Mock auth route not implemented: ${rest.join("/")}`);
  err.code = "NOT_FOUND";
  throw err;
}

async function mockKnowledge(method: string, rest: string[], body?: unknown): Promise<unknown> {
  const tenantId = getSessionUser()?.tenantId ?? "t1";
  if (method === "POST") {
    if (rest[0] === "ingest-link") {
      const { url } = (body ?? {}) as { url?: string };
      if (!url || !/^https?:\/\/\S+/.test(url)) {
        const err = new ApiClientError("Enter a valid http(s) URL.");
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      return mockApi.ingestLink(tenantId, url);
    }
    if (rest[0] === "ingest-pdf") {
      const isForm = typeof FormData !== "undefined" && body instanceof FormData;
      const file = isForm ? (body.get("file") as File | null) : undefined;
      const name = file?.name ?? (body as { name?: string })?.name;
      const sizeKb = file?.size
        ? Math.max(1, Math.round(file.size / 1024))
        : (body as { sizeKb?: number })?.sizeKb ?? 0;
      if (!name) {
        const err = new ApiClientError("A PDF file is required.");
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      return mockApi.ingestPdf(tenantId, { name, sizeKb });
    }
    if (rest[0] === "ingest-text") {
      const { title, content } = (body ?? {}) as { title?: string; content?: string };
      if (!title || !content?.trim()) {
        const err = new ApiClientError("Title and content are required.");
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      return mockApi.ingestText(tenantId, title, content);
    }
  }
  if (rest[0] === "sources") {
    if (rest[1] && method === "DELETE") return mockApi.deleteKnowledgeSource(rest[1]);
    if (rest[1] && method === "GET") return mockApi.knowledgeSourceText(tenantId, rest[1]);
    return mockApi.knowledgeSources(tenantId);
  }
  const err = new ApiClientError(`Mock knowledge route not implemented: ${rest.join("/")}`);
  err.code = "NOT_FOUND";
  throw err;
}

async function mockFaqs(
  method: string,
  rest: string[],
  body?: unknown,
  path?: string,
): Promise<unknown> {
  const tenantId = getSessionUser()?.tenantId ?? "t1";
  if (method === "POST") {
    const { question, answer } = (body ?? {}) as { question?: string; answer?: string };
    if (!question?.trim() || !answer?.trim()) {
      const err = new ApiClientError("Question and answer are required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.createFaq(tenantId, question.trim(), answer.trim());
  }
  if (rest.length) {
    const id = parseInt(rest[0], 10);
    if (method === "DELETE") return mockApi.deleteFaq(id);
    if (method === "PUT" || method === "PATCH") {
      const { question, answer } = (body ?? {}) as { question?: string; answer?: string };
      const updated = await mockApi.updateFaq(id, question, answer);
      if (!updated) {
        const err = new ApiClientError("FAQ not found.");
        err.code = "NOT_FOUND";
        throw err;
      }
      return updated;
    }
  }
  const list = await mockApi.faqs(tenantId);
  const query = (path ?? "").split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const skipStr = params.get("skip");
  const limitStr = params.get("limit");
  if (skipStr !== null || limitStr !== null) {
    const skip = parseInt(skipStr ?? "0", 10);
    const limit = parseInt(limitStr ?? "10", 10);
    return list.slice(skip, skip + limit);
  }
  return list;
}

async function mockPortal(method: string, rest: string[], body?: unknown, path?: string): Promise<unknown> {
  if (method === "GET" && rest[0]?.startsWith("articles")) {
    const query = (path ?? "").split("?")[1] ?? "";
    const tenantId = new URLSearchParams(query).get("tenantId");
    return mockApi.articles(tenantId ?? undefined);
  }
  if (method === "POST" && rest[0] === "tickets") {
    if (rest[1] === "list") {
      const { email } = (body ?? {}) as { email?: string };
      const all = await mockApi.tickets();
      if (!email) return all;
      const needle = email.trim().toLowerCase();
      return all.filter((t) => t.email.toLowerCase() === needle);
    }
    if (rest[2] === "reopen") {
      const updated = await mockApi.reopenTicket(rest[1]);
      if (!updated) {
        const err = new ApiClientError("Ticket not found");
        err.code = "NOT_FOUND";
        throw err;
      }
      return updated;
    }
    const input = (body ?? {}) as Record<string, unknown>;
    if (!input.subject || !input.email) {
      const err = new ApiClientError("Subject and email are required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.createTicket(input as Parameters<typeof mockApi.createTicket>[0]);
  }
  const err = new ApiClientError(`Mock portal route not implemented: ${rest.join("/")}`);
  err.code = "NOT_FOUND";
  throw err;
}

async function mockTickets(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (method === "POST") {
    if (rest.length && rest[1] === "messages") {
      const { body: text, replyTo } = (body as { body?: string; replyTo?: { author: string; text: string } }) ?? {};
      if (!text?.trim()) {
        const err = new ApiClientError("Message body is required.");
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      return mockApi.addAgentMessage(rest[0], text, replyTo);
    }
    if (!rest.length) {
      const input = (body ?? {}) as Record<string, unknown>;
      if (!input.subject || !input.email) {
        const err = new ApiClientError("Subject and email are required.");
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      return mockApi.createTicket(input as Parameters<typeof mockApi.createTicket>[0]);
    }
  }
  if (method === "PATCH" && rest.length) {
    const patch = { ...((body ?? {}) as Record<string, unknown>) };
    if (typeof patch.assignee_id === "string") {
      const agent = mockDb.agents.find((a) => a.id === patch.assignee_id);
      patch.assignee = agent?.name ?? null;
    }
    delete patch.assignee_id;
    if (typeof patch.internal_note === "string" && patch.internal_note.trim()) {
      const note = patch.internal_note.trim();
      delete patch.internal_note;
      await mockApi.addInternalNote(rest[0], note);
    }
    if (Object.keys(patch).length) {
      return mockApi.updateTicket(rest[0], patch as Partial<Ticket>);
    }
    return mockApi.ticket(rest[0]);
  }
  if (method === "DELETE" && rest.length >= 2 && rest[1] === "messages") {
    const updated = await mockApi.deleteMessage(rest[0], rest[2]);
    if (!updated) {
      const err = new ApiClientError("Ticket not found");
      err.code = "NOT_FOUND";
      throw err;
    }
    return updated;
  }
  if (method === "PATCH" && rest.length >= 2 && rest[1] === "messages") {
    const patch = (body ?? {}) as Record<string, unknown>;
    if (typeof patch.body === "string") {
      const ticket = mockDb.tickets.find((t) => t.id === rest[0]);
      const msg = ticket?.msgs.find((m) => m.id === rest[2]);
      if (msg) { msg.text = patch.body; (msg as unknown as Record<string, unknown>).edited = true; }
      return ticket;
    }
  }
  if (method === "POST" && rest.length && rest[1] === "snooze") {
    const ticket = mockDb.tickets.find((t) => t.id === rest[0]);
    if (ticket) { (ticket as unknown as Record<string, unknown>).snoozedUntil = (body as Record<string, unknown>)?.until ?? null; }
    return ticket;
  }
  if (method === "POST" && rest.length && rest[1] === "unsnooze") {
    const ticket = mockDb.tickets.find((t) => t.id === rest[0]);
    if (ticket) { (ticket as unknown as Record<string, unknown>).snoozedUntil = null; }
    return ticket;
  }
  if (method === "POST" && rest.length && rest[1] === "merge") {
    const ticket = mockDb.tickets.find((t) => t.id === rest[0]);
    const targetId = (body as Record<string, unknown>)?.target_ticket_id;
    if (ticket && targetId) { (ticket as unknown as Record<string, unknown>).mergedIntoId = targetId; }
    return ticket;
  }
  if (method === "GET" && rest.length && rest[1] === "events") {
    return [];
  }
  if (method === "POST" && rest.length && rest[1] === "presence") {
    return { ok: true };
  }
  if (!rest.length) return mockApi.tickets();
  const ticket = await mockApi.ticket(rest[0]);
  if (rest[1] === "messages") return ticket?.msgs ?? [];
  if (rest[1] === "assist") return ticket?.assist ?? null;
  return ticket;
}

async function mockTenants(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (!rest.length) {
    if (method === "POST") {
      const { name, slug, email, plan } = (body ?? {}) as {
        name?: string;
        slug?: string;
        email?: string;
        plan?: string;
      };
      if (!name || !slug || !email) {
        const err = new ApiClientError("Business name, slug and email are required.");
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      return mockApi.createTenant({
        name,
        slug,
        email,
        plan: (plan as Parameters<typeof mockApi.createTenant>[0]["plan"]) ?? "starter",
      });
    }
    return mockApi.tenants();
  }
  const id = rest[0];
  if (method === "POST") {
    if (rest[1] === "approve") return mockApi.approveTenant(id);
    if (rest[1] === "suspend") return mockApi.suspendTenant(id);
    if (rest[1] === "reactivate") return mockApi.reactivateTenant(id);
    if (rest[1] === "plan") {
      const { code } = (body ?? {}) as { code?: string };
      if (!code) {
        const err = new ApiClientError("Plan code is required.");
        err.code = "VALIDATION_ERROR";
        throw err;
      }
      return mockApi.changeTenantPlan(id, code as Parameters<typeof mockApi.changeTenantPlan>[1]);
    }
  }
  if (method === "PUT" || method === "PATCH") {
    return mockApi.updateTenant(id, (body ?? {}) as Record<string, unknown>);
  }
  return mockApi.tenant(id);
}

async function mockAgents(method: string, rest: string[], body?: unknown): Promise<unknown> {
  // ── Self-service presence endpoints ──
  if (rest[0] === "me" && rest[1] === "heartbeat" && method === "POST") {
    const userId = getSessionUser()?.id;
    const agent = mockDb.agents.find((a) => a.id === userId);
    if (agent) { agent.online = true; (agent as unknown as Record<string, unknown>).presenceStatus = "online"; }
    const agentsOnline = mockDb.agents.filter((a) => (a.presenceStatus ?? (a.online ? "online" : "offline")) === "online").length;
    emitEvent("agent_presence", { user_id: userId, online: true, presence_status: "online", agents_online: agentsOnline });
    return { ok: true, last_seen: new Date().toISOString() };
  }
  if (rest[0] === "me" && rest[1] === "presence" && (method === "PATCH" || method === "PUT")) {
    const userId = getSessionUser()?.id;
    const status = (body as Record<string, unknown>)?.status as string;
    const agent = mockDb.agents.find((a) => a.id === userId);
    if (agent) {
      agent.online = status !== "offline";
      (agent as unknown as Record<string, unknown>).presenceStatus = status;
    }
    const agentsOnline = mockDb.agents.filter((a) => (a.presenceStatus ?? (a.online ? "online" : "offline")) === "online").length;
    emitEvent("agent_presence", { user_id: userId, online: status !== "offline", presence_status: status, agents_online: agentsOnline });
    return { ok: true, presence_status: status };
  }
  if (method === "POST" && rest.length === 0) {
    const { name, email, role } = (body ?? {}) as { name?: string; email?: string; role?: "agent" | "owner" };
    if (!name || !email) {
      const err = new ApiClientError("Name and email are required to invite an agent.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.inviteAgent({ name, email, role: role ?? "agent" });
  }
  if (rest.length && method === "POST") {
    if (rest[1] === "resend") return mockApi.resendInvite(rest[0]);
    if (rest[1] === "revoke-invite") return mockApi.revokeInvite(rest[0]);
  }
  if (rest.length && method === "DELETE") {
    const { active } = (body ?? {}) as { active?: boolean };
    return mockApi.setAgentActive(rest[0], active ?? false);
  }
  if (rest.length && (method === "PUT" || method === "PATCH")) {
    const patch = (body ?? {}) as Record<string, unknown>;
    if ("active" in patch && Object.keys(patch).length === 1) {
      return mockApi.setAgentActive(rest[0], Boolean(patch.active));
    }
    if ("inbox_scope" in patch || "inboxScope" in patch) {
      const scope = (patch.inbox_scope ?? patch.inboxScope) as InboxScope;
      return mockApi.setAgentScope(rest[0], scope);
    }
    return mockApi.updateAgent(rest[0], patch as Parameters<typeof mockApi.updateAgent>[1]);
  }
  return mockApi.agents();
}

async function mockTeams(method: string, rest: string[], body?: unknown): Promise<unknown> {
  const tenantId = rest[0];
  if (method === "POST" && !tenantId) {
    const { name } = (body ?? {}) as { name?: string };
    if (!name?.trim()) {
      const err = new ApiClientError("Team name is required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.createTeam(name.trim());
  }
  if ((method === "PUT" || method === "PATCH") && tenantId && rest.length === 1) {
    const { name } = (body ?? {}) as { name?: string };
    if (!name?.trim()) {
      const err = new ApiClientError("Team name is required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.updateTeam(tenantId, name.trim());
  }
  if (method === "DELETE" && tenantId && rest.length === 1) {
    return mockApi.deleteTeam(tenantId);
  }
  if (method === "POST" && rest.length === 3 && rest[1] === "members") {
    const { userId } = (body ?? {}) as { userId?: string };
    if (!userId) {
      const err = new ApiClientError("User id is required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.addTeamMember(tenantId, userId);
  }
  if (method === "DELETE" && rest.length === 3 && rest[1] === "members") {
    return mockApi.removeTeamMember(tenantId, rest[2]);
  }
  return mockApi.teams(tenantId);
}

async function mockArticles(method: string, rest: string[], body?: unknown): Promise<unknown> {
  const id = rest[0];
  if (method === "POST" && !id) {
    const { title, content, category, status } = (body ?? {}) as {
      title?: string;
      content?: string;
      category?: string;
      status?: "draft" | "published";
    };
    if (!title?.trim()) {
      const err = new ApiClientError("Title is required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.createArticle({ title: title.trim(), content, category, status });
  }
  if ((method === "PUT" || method === "PATCH") && id) {
    const { title, content, category, status } = (body ?? {}) as {
      title?: string;
      content?: string;
      category?: string;
      status?: "draft" | "published";
    };
    return mockApi.updateArticle(id, { title, content, category, status });
  }
  if (method === "DELETE" && id) {
    return mockApi.deleteArticle(id);
  }
  return mockApi.articles(id);
}

async function mockLabels(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (method === "POST") {
    const { name, color, description } = (body ?? {}) as {
      name?: string;
      color?: string;
      description?: string;
    };
    if (!name?.trim()) {
      const err = new ApiClientError("Label name is required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.createLabel({ name, color, description });
  }
  if (rest.length) {
    const id = rest[0];
    if (method === "DELETE") return mockApi.deleteLabel(id);
    if (method === "PUT" || method === "PATCH") {
      return mockApi.updateLabel(
        id,
        (body ?? {}) as Parameters<typeof mockApi.updateLabel>[1],
      );
    }
    if (method === "GET") {
      const hit = mockDb.labels.find((l) => l.id.toLowerCase() === id.toLowerCase());
      return hit ?? null;
    }
  }
  return mockApi.labels();
}

async function mockCanned(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (method === "POST") {
    const { label, text } = (body ?? {}) as { label?: string; text?: string };
    if (!label || !text) {
      const err = new ApiClientError("Label and text are required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.createCanned({ label, text });
  }
  if (rest.length) {
    const id = rest[0];
    if (method === "DELETE") return mockApi.deleteCanned(id);
    if (method === "PUT" || method === "PATCH") {
      return mockApi.updateCanned(id, (body ?? {}) as Partial<CannedResponse>);
    }
  }
  return mockApi.canned();
}

async function mockRules(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (method === "POST") {
    if (rest[0] === "test") return testRules(String((body as { text?: string })?.text ?? ""));
    if (rest[0] === "reset-presets") return mockApi.resetPresets();
    return mockApi.createRule(
      (body ?? {}) as Parameters<typeof mockApi.createRule>[0],
    );
  }
  if (rest.length) {
    const id = rest[0];
    if (method === "DELETE") return mockApi.deleteRule(id);
    if (method === "PUT" || method === "PATCH") {
      const patch = (body ?? {}) as Record<string, unknown>;
      if ("enabled" in patch && Object.keys(patch).length === 1) return mockApi.toggleRule(id);
      if (patch.reset) return mockApi.resetRule(id);
      return mockApi.updateRule(id, patch as Parameters<typeof mockApi.updateRule>[1]);
    }
  }
  return mockApi.rules();
}

/* Automations + SLA + integrations (owner settings hub routes). */

async function mockAutomations(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (method === "POST") {
    if (rest[0] === "tick") return mockApi.runScheduleTick();
    if (rest[0] === "log") return mockApi.automationLog();
    if (rest[1] === "run") return mockApi.runAutomationNow(rest[0]);
    if (rest[1] === "toggle") return mockApi.toggleAutomation(rest[0]);
    return mockApi.createAutomation(
      (body ?? {}) as Parameters<typeof mockApi.createAutomation>[0],
    );
  }
  if (rest.length) {
    const id = rest[0];
    if (method === "DELETE") return mockApi.deleteAutomation(id);
    if (method === "PUT" || method === "PATCH") {
      const patch = (body ?? {}) as Record<string, unknown>;
      if ("enabled" in patch && Object.keys(patch).length === 1) return mockApi.toggleAutomation(id);
      return mockApi.updateAutomation(id, patch as Parameters<typeof mockApi.updateAutomation>[1]);
    }
  }
  if (rest[0] === "log") return mockApi.automationLog();
  return mockApi.automations();
}

async function mockSla(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (rest[0] === "schedules") {
    if (method === "POST") {
      return mockApi.createSlaSchedule(
        (body ?? {}) as Parameters<typeof mockApi.createSlaSchedule>[0],
      );
    }
    return mockApi.slaSchedules();
  }
  if (method === "POST") {
    if (rest[0] === "tick") return mockApi.runScheduleTick();
    return mockApi.createSlaPolicy(
      (body ?? {}) as Parameters<typeof mockApi.createSlaPolicy>[0],
    );
  }
  if (rest.length) {
    const id = rest[0];
    if (method === "DELETE") return mockApi.deleteSlaPolicy(id);
    if (method === "PUT" || method === "PATCH") {
      const patch = (body ?? {}) as Record<string, unknown>;
      if ("enabled" in patch && Object.keys(patch).length === 1) return mockApi.toggleSlaPolicy(id);
      return mockApi.updateSlaPolicy(id, patch as Parameters<typeof mockApi.updateSlaPolicy>[1]);
    }
  }
  return mockApi.slaPolicies();
}

async function mockWebhooks(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (rest[0] === "deliveries") return mockApi.webhookDeliveries();
  if (method === "POST") {
    if (rest[1] === "test") return mockApi.testWebhook(rest[0]);
    if (rest[1] === "toggle") return mockApi.toggleWebhook(rest[0]);
    return mockApi.createWebhook(
      (body ?? {}) as Parameters<typeof mockApi.createWebhook>[0],
    );
  }
  if (rest.length) {
    const id = rest[0];
    if (method === "DELETE") return mockApi.deleteWebhook(id);
    if (method === "PUT" || method === "PATCH") {
      const patch = (body ?? {}) as Record<string, unknown>;
      if ("active" in patch && Object.keys(patch).length === 1) return mockApi.toggleWebhook(id);
      return mockApi.updateWebhook(id, patch as Parameters<typeof mockApi.updateWebhook>[1]);
    }
  }
  return mockApi.webhooks();
}

async function mockChannels(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (method === "POST") {
    if (rest[1] === "connect") {
      const { config } = (body ?? {}) as { config?: Record<string, string | boolean> };
      return mockApi.connectChannel(rest[0], config ?? {});
    }
    if (rest[1] === "disconnect") return mockApi.disconnectChannel(rest[0]);
    if (rest[1] === "test") {
      const { config } = (body ?? {}) as { config?: Record<string, string | boolean> };
      return mockApi.testChannel(rest[0], config);
    }
    if (rest[1] === "sync") return mockApi.syncChannel(rest[0]);
  }
  if (method === "GET" && rest[1] === "embed") return mockApi.channelEmbed(rest[0]);
  if (method === "PUT" || method === "PATCH") {
    return mockApi.updateChannel(rest[0], (body ?? {}) as Parameters<typeof mockApi.updateChannel>[1]);
  }
  return mockApi.channels();
}

async function mockApiKeys(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (method === "POST") {
    const { name, scopes } = (body ?? {}) as { name?: string; scopes?: string[] };
    if (!name?.trim()) {
      const err = new ApiClientError("Key name is required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.createApiKey({ name, scopes: scopes ?? ["tickets:read"] });
  }
  if (rest.length && method === "DELETE") return mockApi.revokeApiKey(rest[0]);
  return mockApi.apiKeys();
}

async function mockFeatureFlags(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (rest.length && (method === "PUT" || method === "PATCH")) {
    const { enabled } = (body ?? {}) as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      const err = new ApiClientError("enabled (boolean) is required.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    return mockApi.updateFeatureFlag(rest[0], enabled);
  }
  return mockApi.featureFlags();
}

async function mockPresets(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (method === "POST") {
    if (rest[1] === "restore") return mockApi.restorePresetVersion(rest[0]);
    return mockApi.createPresetVersion(
      (body ?? {}) as Parameters<typeof mockApi.createPresetVersion>[0],
    );
  }
  return mockApi.presetVersions();
}

async function mockNotifications(method: string, rest: string[], body?: unknown): Promise<unknown> {
  if (rest[0] === "preferences") {
    const userId =
      (body as { userId?: string } | undefined)?.userId ??
      getSessionUser()?.id ??
      "u1";
    if (method === "PUT" || method === "PATCH") {
      return mockApi.updateNotificationPrefs(
        userId,
        (body ?? {}) as Parameters<typeof mockApi.updateNotificationPrefs>[1],
      );
    }
    return mockApi.notificationPrefs(userId);
  }
  return mockApi.notifications();
}
