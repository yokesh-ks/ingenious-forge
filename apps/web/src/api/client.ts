import type {
  AddCustomProviderRequest,
  ApiError,
  ApprovalMode,
  CommitMessageDraft,
  CommitResult,
  DirectoryListing,
  FetchCustomModelsRequest,
  FetchModelsRequest,
  FileApplications,
  FileChange,
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
  SessionStats,
  SetApprovalModeRequest,
  SetSessionModelRequest,
  TerminalShells,
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
  if (response.status === 204) return undefined as T;
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
  /** Opens the project's folder, or one of its files, in a program on the
   * user's machine. */
  openProjectIn: (
    id: string,
    app: OpenApp,
    path: string | null = null,
    application: string | null = null,
  ) =>
    post<Project>(`/api/projects/${encodeURIComponent(id)}/open-in`, {
      app,
      path,
      application,
    } satisfies OpenInRequest),
  /** The programs that can open a project file. */
  fileApplications: (id: string, path: string) =>
    request<FileApplications>(
      `/api/projects/${encodeURIComponent(id)}/file/applications?path=${encodeURIComponent(path)}`,
    ),
  /** Where the panel reads an Office file from, converted to a PDF. */
  officePdfUrl: (id: string, path: string) =>
    `/api/projects/${encodeURIComponent(id)}/file/office-pdf?path=${encodeURIComponent(path)}`,
  /** Where the panel's viewers read an image, PDF or sheet from. */
  rawFileUrl: (id: string, path: string) =>
    `/api/projects/${encodeURIComponent(id)}/file/raw?path=${encodeURIComponent(path)}`,
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
  closeTerminal: (projectId: string, tab: string) =>
    request<void>(
      `/api/projects/${encodeURIComponent(projectId)}/terminal?${new URLSearchParams({ tab })}`,
      { method: "DELETE" },
    ),
  /** The installed shells a terminal can run, the default first. */
  terminalShells: () => request<TerminalShells>("/api/terminal/shells"),
  /** One folder's direct entries; an empty path is the project's top. */
  projectDirectory: (id: string, path: string) =>
    request<DirectoryListing>(
      `/api/projects/${encodeURIComponent(id)}/directory?path=${encodeURIComponent(path)}`,
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
  /** A page of a session's latest logged events: at most `limit`, all
   * before sequence number `before` when given. */
  sessionEventsPage: (sessionId: string, { before, limit }: { before?: number; limit: number }) =>
    request<SessionEnvelope[]>(
      `/api/sessions/${encodeURIComponent(sessionId)}/events?${new URLSearchParams({
        ...(before === undefined ? {} : { before: String(before) }),
        limit: String(limit),
      })}`,
    ),
  /** The files the agent changed in a session, each with its latest diff. */
  sessionChanges: (sessionId: string) =>
    request<FileChange[]>(`/api/sessions/${encodeURIComponent(sessionId)}/changes`),
  /** A session's totals, folded from its whole log. */
  sessionStats: (sessionId: string) =>
    request<SessionStats>(`/api/sessions/${encodeURIComponent(sessionId)}/stats`),
  /** Shows the OS folder dialog and resolves when the user has answered it. */
  pickFolder: () => post<PickedFolder>("/api/fs/pick-folder", {}),
};
