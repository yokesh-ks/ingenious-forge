# Infrastructure and Development

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [.github/workflows/build-binaries.yml](.github/workflows/build-binaries.yml)
- [.github/workflows/ci.yml](.github/workflows/ci.yml)
- [.github/workflows/preview-packages.yml](.github/workflows/preview-packages.yml)
- [AGENTS.md](AGENTS.md)
- [README.md](README.md)
- [package.json](package.json)
- [scripts/build-binaries.sh](scripts/build-binaries.sh)
- [scripts/check-pinned-deps.mjs](scripts/check-pinned-deps.mjs)
- [scripts/create-source-archive.sh](scripts/create-source-archive.sh)
- [scripts/local-release.mjs](scripts/local-release.mjs)
- [scripts/preview-packages.mjs](scripts/preview-packages.mjs)
- [scripts/preview-packages.test.mjs](scripts/preview-packages.test.mjs)
- [scripts/publish-release-announcement.mjs](scripts/publish-release-announcement.mjs)
- [scripts/publish-release-announcement.test.mjs](scripts/publish-release-announcement.test.mjs)
- [scripts/publish.mjs](scripts/publish.mjs)
- [scripts/release-packages.mjs](scripts/release-packages.mjs)
- [tsconfig.json](tsconfig.json)

</details>



The infrastructure and development subsystem of `pi` manages continuous integration and delivery (`.github/workflows/ci.yml`, `.github/workflows/build-binaries.yml`), community contribution workflows and permission gates (`AGENTS.md`), cross-platform binary compilation and packaging (`scripts/build-binaries.sh`), lockstep versioning and publishing (`scripts/publish.mjs`), and comprehensive testing infrastructure (`package.json`, `./test.sh`). 

This is a parent overview page. For deep technical details, refer to the child pages:
- **CI/CD and Binary Distribution** [10.1]
- **Contribution Gate and Community Workflow** [10.2]
- **Testing Infrastructure** [10.3]

---

## CI/CD and Binary Distribution

The build, test, and release automation pipeline is orchestrated through GitHub Actions workflows and Node.js utility scripts located in the `scripts/` directory.

- **Continuous Integration (`ci.yml`)**: Automatically triggers on pushes and pull requests targeting `main`, executing workspace installation (`npm ci --ignore-scripts`), building workspace packages (`npm run build`), running static validation (`npm run check`), and launching test suites [[.github/workflows/ci.yml:1-46](.github/workflows/ci.yml:1-46)].
- **Binary Compilation (`build-binaries.yml`, `build-binaries.sh`)**: Compiles single-file native executables across platforms (`darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `windows-x64`, `windows-arm64`) using `bun build --compile` with disabled bunfig/dotenv autoload flags to prevent environment leakage [[.github/workflows/build-binaries.yml:1-100](.github/workflows/build-binaries.yml:1-100), [scripts/build-binaries.sh:117-137](scripts/build-binaries.sh:117-137)].
- **Local Release Verification (`local-release.mjs`)**: Packs publishable workspace packages, builds local standalone Bun/Node artifacts, and executes smoke tests in isolated directories outside the workspace [[scripts/local-release.mjs:1-137](scripts/local-release.mjs:1-137)].
- **Lockstep Publishing (`publish.mjs`)**: Validates that all public workspace packages maintain lockstep versioning before publishing tarballs to npm with provenance [[scripts/publish.mjs:1-64](scripts/publish.mjs:1-64)].

### Binary Artifact Generation Pipeline

```mermaid
flowchart TD
    "SourceCheckout"["Source Checkout"] --> "npmCi[npm ci --ignore-scripts]"
    "npmCi" --> "npmCheck[npm run check]"
    "npmCheck" --> "buildBinariesScript[scripts/build-binaries.sh]"
    "buildBinariesScript" --> "bunCompile[bun build --compile]"
    "bunCompile" --> "createArchives[Create .tar.gz / .zip]"
    "createArchives" --> "uploadArtifacts[GitHub Actions Artifact Upload]"
```

Sources: [[.github/workflows/ci.yml:1-46](.github/workflows/ci.yml:1-46)], [[.github/workflows/build-binaries.yml:1-100](.github/workflows/build-binaries.yml:1-100)], [[scripts/build-binaries.sh:117-137](scripts/build-binaries.sh:117-137)], [[scripts/publish.mjs:1-64](scripts/publish.mjs:1-64)], [[scripts/local-release.mjs:1-137](scripts/local-release.mjs:1-137)]

For details, see [CI/CD and Binary Distribution](#10.1).

---

## Contribution Gate and Community Workflow

Community contributions and development practices are governed by strict automation rules, permission policies, and style guidelines.

- **Contributor Permission System**: New issues and pull requests from external contributors are auto-closed by default, requiring maintainer review [[README.md:11-11](README.md:11-11)].
- **Development Rules (`AGENTS.md`)**: Enforces conversational style, strict code quality rules (such as banning top-level dynamic imports and `any` types), Git worktree isolation practices, and specific command protocols [[AGENTS.md:1-73](AGENTS.md:1-73)].
- **Issue Triage and PR Etiquette**: Contributors must apply appropriate `pkg:*` labels (e.g., `pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:tui`) to identify affected packages when opening issues [[AGENTS.md:85-87](AGENTS.md:85-87)].

For details, see [Contribution Gate and Community Workflow](#10.2).

---

## Testing Infrastructure

The monorepo maintains a multi-layered testing and quality assurance framework to prevent regressions across core packages, LLM integrations, and storage runtimes.

- **Check Suite (`npm run check`)**: Orchestrates static analysis, linting, formatting checks via Biome, dependency pinning verification (`scripts/check-pinned-deps.mjs`), runtime dependency audits (`scripts/check-runtime-deps.mjs`), and entry-graph validations (`scripts/check-entry-graphs.mjs`) [[package.json:20-28](package.json:20-28)].
- **Test Runner (`test.sh`)**: Executes workspace test suites while avoiding LLM-dependent E2E tests when provider authentication keys are omitted [[AGENTS.md:34-36](AGENTS.md:34-36)].
- **Conformance Test Suites**: Includes dedicated test runners for protocol compliance, such as the Model Context Protocol (MCP) client conformance suite (`packages/coding-agent/test/mcp-conformance/run.ts`) [[package.json:42-42](package.json:42-42), [.github/workflows/ci.yml:47-65](.github/workflows/ci.yml:47-66)].

### System Entity to Code Symbol Mapping

```mermaid
flowchart TD
  subgraph "CI/CD & Release Workflows"
    "ciWorkflow[.github/workflows/ci.yml]" --> "npmTest[npm test]"
    "buildBinariesWorkflow[.github/workflows/build-binaries.yml]" --> "buildBinariesScript[scripts/build-binaries.sh]"
    "publishScript[scripts/publish.mjs]" --> "produceArtifactSet[produceArtifactSet]"
  end

  subgraph "Quality & Validation Subsystems"
    "npmRunCheck[npm run check]" --> "checkPinnedDeps[scripts/check-pinned-deps.mjs]"
    "npmRunCheck" --> "checkRuntimeDeps[scripts/check-runtime-deps.mjs]"
    "npmRunCheck" --> "checkTsImports[scripts/check-ts-relative-imports.mjs]"
  end

  "AGENTS.md" --> "npmRunCheck"
  "AGENTS.md" --> "testScript[./test.sh]"
```

Sources: [[package.json:20-58](package.json:20-58)], [[.github/workflows/ci.yml:1-65](.github/workflows/ci.yml:1-66)], [[AGENTS.md:32-36](AGENTS.md:32-36)], [[scripts/publish.mjs:1-64](scripts/publish.mjs:1-64)]

For details, see [Testing Infrastructure](#10.3).

---

For further details, visit the child pages:
- [CI/CD and Binary Distribution](#10.1)
- [Contribution Gate and Community Workflow](#10.2)
- [Testing Infrastructure](#10.3)