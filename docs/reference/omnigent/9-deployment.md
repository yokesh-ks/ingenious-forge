# Deployment

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [.gitattributes](.gitattributes)
- [deploy/docker/Dockerfile](deploy/docker/Dockerfile)
- [deploy/docker/Dockerfile.ubi](deploy/docker/Dockerfile.ubi)
- [patches/@tiptap__react@3.31.4.patch](patches/@tiptap__react@3.31.4.patch)
- [patches/README.md](patches/README.md)
- [tests/deploy/test_host_image_cli_install.py](tests/deploy/test_host_image_cli_install.py)
- [tests/deploy/test_publish_images_web_build_platform.py](tests/deploy/test_publish_images_web_build_platform.py)
- [web/src/shell/TipTapNodeViewSelection.test.tsx](web/src/shell/TipTapNodeViewSelection.test.tsx)
- [web/src/shell/TipTapRendererRegistry.test.tsx](web/src/shell/TipTapRendererRegistry.test.tsx)

</details>



This page provides a high-level overview of the deployment options available for the Omnigent server. It outlines the key deployment targets, including containerized self-hosted setups with Docker, various cloud platform providers, Kubernetes, and multi-user authentication configurations. For detailed instructions, configurations, and advanced setups, each topic links to its respective dedicated child page.

---

## Deployment Overview

Omnigent is designed for flexible deployment models ranging from local development and desktop use, to scalable cloud or Kubernetes clusters with multi-user support. The core server is a FastAPI application responsible for coordinating agents, managing sessions, authentication, and provisioning managed sandbox hosts.

The deployment scenarios emphasize modularity between the **server**—which runs in the `omnigent-server` image as the FastAPI app with REST and WebSockets—and **managed hosts**—sandboxed environments running the Omnigent Host process, typically in the `omnigent-host` image.

```mermaid
title Deployment Architecture Overview
graph TD
    ClientLayer["Client Layer\n(Web UI, CLI, SDKs)"]
    ServerLayer["Omnigent Server\n(docker image omnigent-server)"]
    WebUI["React SPA\nstatic assets\n(omnigent/server/static/web-ui)"]
    FastAPIApp["FastAPI app\n(omnigent/server/app.py)"]
    DB["SQLAlchemy DB Layer\n(Postgres or SQLite)"]
    Artifacts["ArtifactStore\n(local FS or PVC)"]
    ManagedHost["Managed Sandbox Hosts\n(docker image omnigent-host)"]
    RunnerTunnel["Runner WebSocket Tunnel\n(omnigent.runner.transports.ws_tunnel)"]

    ClientLayer -->|HTTP/WS REST API| FastAPIApp
    FastAPIApp --> DB
    FastAPIApp --> Artifacts
    FastAPIApp --> WebUI
    ServerLayer --> FastAPIApp
    ServerLayer --> WebUI
    FastAPIApp --> RunnerTunnel
    ManagedHost --> RunnerTunnel
```

The server image focuses on the orchestrator and excludes heavy tooling and native harness runtimes required only on hosts. Management and lifecycle of sandbox hosts is handled via the managed hosts system that interfaces with external sandbox providers or local sandbox runtimes.

**Sources:**
- [deploy/docker/Dockerfile:1-42]()

---

## Deployment Targets

### Docker & Self-Hosted

The primary deployment path for users seeking complete control is deploying Omnigent using Docker images and docker-compose. The multi-stage `Dockerfile` produces two main images:

- **omnigent-server**: The FastAPI server image acting as the HTTP and WebSocket coordinator. It ships the Omnigent Python package and the prebuilt React SPA but excludes native harness runtime dependencies like tmux or git [deploy/docker/Dockerfile:1-14](). It uses Postgres or SQLite for persistence.
- **omnigent-host**: The host sandbox image, built with the `--target host` flag, which packages runtime dependencies and harness CLI tools such as `claude`, `codex`, `pi`, `kiro-cli`, and `agy` [deploy/docker/Dockerfile:16-22](). This image provisions managed hosts for sandboxed agent execution. It includes native CLI tools and sandbox helpers but omits the web UI and database drivers.

The automation includes a `docker-compose.yaml` file that helps set up a Postgres service alongside the Omnigent server. An entrypoint script (`deploy/docker/entrypoint.py`) manages configuration, DB migrations, app construction, and artifact storage initialization, all controlled by environment variables like `DATABASE_URL` and `ARTIFACT_DIR`.

For detailed setup, environment variable explanations, CLI harness installation, and differences between Postgres and SQLite storage backends, see [Docker & Self-Hosted](#9.1).

```mermaid
title Docker Image Roles and Build Targets
graph TD
    subgraph "Docker Build"
        WebBuilder["node:${NODE_VERSION}-slim web-builder"]
        PythonBuilder["python:${PYTHON_VERSION}-slim builder"]
        ServerBuilder["server-builder (adds SPA, psycopg)"]
        HostBuilder["host (adds git, tmux, harness CLIs)"]
    end

    WebBuilder --> ServerBuilder
    PythonBuilder --> ServerBuilder
    PythonBuilder --> HostBuilder

    ServerBuilder["omnigent-server image"] -->|runs| FastAPIApp["FastAPI server + WS coordinator"]
    HostBuilder["omnigent-host image"] -->|runs| HostRuntime["Omnigent Host\nwith CLI harnesses"]
```

**Sources:**
- [deploy/docker/Dockerfile:1-151]()
- [deploy/docker/Dockerfile.ubi:1-161]()
- [tests/deploy/test_host_image_cli_install.py:1-79]()
- [tests/deploy/test_publish_images_web_build_platform.py:1-127]()

---

### Cloud Platform Targets

Omnigent supports deployment on multiple cloud platforms for scalability and managed infrastructure integration. Supported platforms include:

- **Render, Railway:** Managed web services with auto-provisioned Postgres databases.
- **Fly.io:** Distributed global deployments with persistent volumes supporting SQLite.
- **Modal:** Serverless container applications with durable storage volumes.
- **Hugging Face Spaces:** Container-based demo deployments.
- **Cloudflare Containers, Databricks Apps, Daytona, Gensee, CockroachDB:** Specialized hosting environments and database services.
- **Tailscale:** Networking overlay solutions for private connectivity.

Each platform has specific deployment nuances, environment variables, and operational considerations. Comprehensive deployment guides describe one-click deploys, persistent storage setup, and platform-specific configurations.

See [Cloud Platform Targets](#9.2) for detailed platform-by-platform deployment instructions.

```mermaid
title Cloud Platforms and Omnigent Integration
graph LR
    OmnigentServer["Omnigent Server (FastAPI)"]
    Platform1["Render, Railway (Managed Postgres, Web Service)"]
    Platform2["Fly.io (Global Edge, Persistent Volumes)"]
    Platform3["Modal (Serverless Containers, Durable Volumes)"]
    Platform4["Hugging Face Spaces (Demo Setup)"]
    Platform5["Cloudflare Containers"]
    Platform6["Databricks Apps (Lakebase DB + UC Volumes)"]
    Platform7["Tailscale Overlay"]
    Platform8["Daytona Sandbox Runtime"]
    Platform9["Gensee Sandbox Runtime"]

    OmnigentServer --> Platform1
    OmnigentServer --> Platform2
    OmnigentServer --> Platform3
    OmnigentServer --> Platform4
    OmnigentServer --> Platform5
    OmnigentServer --> Platform6
    OmnigentServer --> Platform7
    OmnigentServer --> Platform8
    OmnigentServer --> Platform9
```

**Sources:**
- No direct sources provided in the given files for this section.

---

### Kubernetes Deployment

Enterprise-grade deployments can use Kubernetes, leveraging Kustomize manifests for declarative configuration management. Kubernetes deployment includes:

- **Base manifests:** These describe the FastAPI pod, service, and stateful components.
- **Ingress & cert-manager:** For TLS termination and external access.
- **Postgres overlay:** Database setup integrated into the cluster.
- **Sandbox overlays:** OpenShell and sandbox-runner overlays manage multi-host sandbox provisioning and runner interaction.

The Kubernetes image is multi-architecture, matching the Docker images built for self-hosted deployments. Configuration supports secure secrets handling, environment variable injection, and integration with external authentication systems.

Visit [Kubernetes Deployment](#9.3) to explore manifests, overlay usage, and setup examples.

**Sources:**
- No direct sources provided in the given files for this section.

---

## Managed Sandbox Hosts

Omnigent provisions **Managed Hosts** as sandboxed environments to run agent harnesses and related tooling. Managed hosts connect to the server through a WebSocket tunnel at `/v1/runner/tunnel`, utilizing the `omnigent-host` image optimized for execution environments.

Managed hosts run the agent harness CLI tools (`claude`, `codex`, etc.) and sandbox runtime dependencies like `tmux` and `git`, excluding server-only libraries such as Psycopg [deploy/docker/Dockerfile:16-22](). They are provisioned by implementations of the `SandboxLauncher` interface, which can target cloud sandboxes (Modal, Daytona) or local runtimes (OpenShell, BoxLite micro-VMs).

```mermaid
title Managed Host Provisioning Flow
graph TD
    Server["FastAPI Server\n(omnigent-server image)"]
    ManagedHost["Managed Sandbox\n(omnigent-host image)"]
    SandboxLauncher["SandboxLauncher Interface"]
    RunnerTunnel["Runner WebSocket Tunnel\n(omnigent.runner.transports.ws_tunnel)"]

    Server -->|launch_managed_host() calls provision()| SandboxLauncher
    SandboxLauncher -->|runs omnigent host inside sandbox| ManagedHost
    ManagedHost -->|WebSocket tunnel to runner registry| RunnerTunnel
    RunnerTunnel --> Server
```

Examples and CLI scripts demonstrate installing harness tools into host images and coordinating session launches through these managed hosts.

For concrete setup examples and lifecycle handling, see [Docker & Self-Hosted](#9.1) and [Kubernetes Deployment](#9.3).

**Sources:**
- [deploy/docker/Dockerfile:16-27]()

---

## Authentication & Multi-User Setup

Omnigent supports flexible authentication options to handle both simple deployments and large multi-user scenarios:

- **Built-in Accounts:** Local database-backed accounts with an invite-only signup flow. The first user to access the server gains admin privileges. Account data and permissions are managed within the server's store.
- **OIDC / SSO Integration:** Standard OAuth 2.0 flows with OpenID Connect identity providers such as Google, GitHub, Okta, and Microsoft. Includes PKCE support for client-side security.
- **Header Proxy Auth:** Trusts user identity set by upstream reverse-proxy authentication layers, using headers like `X-Forwarded-Email`. Enables integration with Cloudflare Access, Google IAP, or identity-aware proxies.

These are managed by the `UnifiedAuthProvider` backend which selects the appropriate mode based on configuration at startup. Permission models include team collaboration, session-level sharing, co-driving, and forking with detailed ACL enforcement.

Refer to [Authentication & Multi-User Setup](#9.4) for configuration details, invite workflows, and operational best practices.

**Sources:**
- No direct sources provided in the given files for this section.

---

## Image Publishing Pipeline

Omnigent automates building and publishing of Docker images using GitHub Actions workflows, ensuring reliable multi-architecture support and semantic version tagging.

- **`omnigent-server` Image:** Packages the FastAPI server app and the React SPA frontend with required Python dependencies.
- **`omnigent-host` Image:** Contains the runtime environment for managed hosts, including harness CLI tools, sandbox utilities, and native dependencies.

Images are tagged by git commit SHA, semantic version, and include `latest`. This enables both stable production releases and active development snapshots to coexist in registries. The web UI build stage (`web-builder`) is pinned to the build host's platform (`--platform=$BUILDPLATFORM`) to prevent issues with QEMU arm64 emulation during cross-builds [deploy/docker/Dockerfile:72-76]().

**Sources:**
- [deploy/docker/Dockerfile:1-42]()
- [deploy/docker/Dockerfile:72-76]()
- [tests/deploy/test_publish_images_web_build_platform.py:1-127]()

---

# See Also

Detailed guides for each deployment target and advanced authentication setup are in:

- [Docker & Self-Hosted](#9.1)
- [Cloud Platform Targets](#9.2)
- [Kubernetes Deployment](#9.3)
- [Authentication & Multi-User Setup](#9.4)