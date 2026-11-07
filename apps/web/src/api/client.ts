import type {
  AddCustomProviderRequest,
  ApiError,
  ApprovalMode,
  CommitMessageDraft,
  CommitResult,
  FetchCustomModelsRequest,
  FetchModelsRequest,
  FileContent,
  FileList,
  GitHubConnection,
  GitStatus,
  ModelCatalog,
  OpenApp,
  OpenInRequest,
  OpenProjectRequest,
  PickedFolder,
  Project,
  ProviderCustomization,
  ProviderKeyStatus,
  ProviderKeyTest,
  ProviderModel,
  PushResult,
  RenameProjectRequest,
  SandboxInfo,
  Session,
  SessionDefaults,
  SessionEnvelope,
  SessionModel,
  SetApprovalModeRequest,
  SetSessionModelRequest,
  UpdateSessionRequest,
} from "./types";

/** A failed API call, carrying the server's message for the user. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiRequestError("Cannot reach the Forge server.", 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

function post<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const api = {
  recentProjects: () => request<Project[]>("/api/projects"),
  openProject: (path: string) =>
    post<Project>("/api/projects", { path } satisfies OpenProjectRequest),
  getProject: (id: string) => request<Project>(`/api/projects/${encodeURIComponent(id)}`),
  renameProject: (id: string, name: string) =>
    post<Project>(
      `/api/projects/${encodeURIComponent(id)}`,
      { name } satisfies RenameProjectRequest,
      "PATCH",
    ),
  /** Removes the project from Forge; its folder on disk stays. */
  deleteProject: (id: string) =>
    request<Project>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** Opens the project's folder in a program on the user's machine. */
  openProjectIn: (id: string, app: OpenApp) =>
    post<Project>(`/api/projects/${encodeURIComponent(id)}/open-in`, {
      app,
    } satisfies OpenInRequest),
  /** Renames, pins or archives a session. */
  updateSession: (id: string, update: UpdateSessionRequest) =>
    post<Session>(`/api/sessions/${encodeURIComponent(id)}`, update, "PATCH"),
  /** Deletes a session permanently. Returns the deleted session. */
  deleteSession: (id: string) =>
    request<Session>(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** Starts a new session from a copy of this one. */
  forkSession: (id: string) =>
    request<Session>(`/api/sessions/${encodeURIComponent(id)}/fork`, { method: "POST" }),
  listSessions: (projectId: string) =>
    request<Session[]>(`/api/projects/${encodeURIComponent(projectId)}/sessions`),
  /** Creates a session with `model`, or the server's default without one. */
  createSession: (projectId: string, model?: SessionModel) =>
    post<Session>(
      `/api/projects/${encodeURIComponent(projectId)}/sessions`,
      model ? { model } : {},
    ),
  projectFiles: (projectId: string) =>
    request<FileList>(`/api/projects/${encodeURIComponent(projectId)}/files`),
  projectFile: (projectId: string, path: string) =>
    request<FileContent>(
      `/api/projects/${encodeURIComponent(projectId)}/file?${new URLSearchParams({ path })}`,
    ),
  createBranch: (projectId: string, name: string) =>
    post<GitStatus>(`/api/projects/${encodeURIComponent(projectId)}/git/branch`, { name }),
  commit: (projectId: string, message: string) =>
    post<CommitResult>(`/api/projects/${encodeURIComponent(projectId)}/git/commit`, { message }),
  providerKeys: () => request<ProviderKeyStatus[]>("/api/settings/providers"),
  setProviderKey: (provider: string, key: string) =>
    post<ProviderKeyStatus>(
      `/api/settings/providers/${encodeURIComponent(provider)}/key`,
      { key },
      "PUT",
    ),
  removeProviderKey: (provider: string) =>
    request<ProviderKeyStatus>(`/api/settings/providers/${encodeURIComponent(provider)}/key`, {
      method: "DELETE",
    }),
  setProviderCustomization: (provider: string, customization: ProviderCustomization) =>
    post<ProviderKeyStatus>(
      `/api/settings/providers/${encodeURIComponent(provider)}/customization`,
      customization,
      "PUT",
    ),
  fetchProviderModels: (provider: string, form: FetchModelsRequest) =>
    post<ProviderModel[]>(
      `/api/settings/providers/${encodeURIComponent(provider)}/models/fetch`,
      form,
    ),
  fetchCustomProviderModels: (form: FetchCustomModelsRequest) =>
    post<ProviderModel[]>("/api/settings/custom-providers/models", form),
  addCustomProvider: (provider: AddCustomProviderRequest) =>
    post<ProviderKeyStatus>("/api/settings/custom-providers", provider),
  removeCustomProvider: (id: string) =>
    request<void>(`/api/settings/custom-providers/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  testProviderKey: (provider: string) =>
    request<ProviderKeyTest>(`/api/settings/providers/${encodeURIComponent(provider)}/key/test`, {
      method: "POST",
    }),
  sessionDefaults: () => request<SessionDefaults>("/api/settings/defaults"),
  setSessionDefaults: (defaults: SessionDefaults) =>
    post<SessionDefaults>("/api/settings/defaults", defaults, "PUT"),
  github: () => request<GitHubConnection>("/api/settings/github"),
  connectGitHub: (token: string) =>
    post<GitHubConnection>("/api/settings/github", { token }, "PUT"),
  disconnectGitHub: () => request<GitHubConnection>("/api/settings/github", { method: "DELETE" }),
  sessionSandbox: (sessionId: string) =>
    request<SandboxInfo>(`/api/sessions/${encodeURIComponent(sessionId)}/sandbox`),
  push: (projectId: string) =>
    post<PushResult>(`/api/projects/${encodeURIComponent(projectId)}/git/push`, {}),
  draftCommitMessage: (sessionId: string) =>
    post<CommitMessageDraft>(`/api/sessions/${encodeURIComponent(sessionId)}/commit-message`, {}),
  gitStatus: (projectId: string) =>
    request<GitStatus>(`/api/projects/${encodeURIComponent(projectId)}/git/status`),
  modelCatalog: () => request<ModelCatalog>("/api/models"),
  setSessionModel: (sessionId: string, model: SessionModel) =>
    post<Session>(
      `/api/sessions/${encodeURIComponent(sessionId)}/model`,
      { model } satisfies SetSessionModelRequest,
      "PUT",
    ),
  setApprovalMode: (sessionId: string, mode: ApprovalMode) =>
    post<Session>(
      `/api/sessions/${encodeURIComponent(sessionId)}/approval-mode`,
      { mode } satisfies SetApprovalModeRequest,
      "PUT",
    ),
  /** A session's logged events with a sequence number above `after`. */
  sessionEvents: (sessionId: string, after = 0) =>
    request<SessionEnvelope[]>(
      `/api/sessions/${encodeURIComponent(sessionId)}/events?${new URLSearchParams({ after: String(after) })}`,
    ),
  /** Shows the OS folder dialog and resolves when the user has answered it. */
  pickFolder: () => post<PickedFolder>("/api/fs/pick-folder", {}),
};
