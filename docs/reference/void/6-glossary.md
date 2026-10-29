# Glossary

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [.configurations/configuration.dsc.yaml](.configurations/configuration.dsc.yaml)
- [.devcontainer/devcontainer.json](.devcontainer/devcontainer.json)
- [.eslint-plugin-local/code-declare-service-brand.ts](.eslint-plugin-local/code-declare-service-brand.ts)
- [.eslint-plugin-local/code-layering.ts](.eslint-plugin-local/code-layering.ts)
- [.voidrules](.voidrules)

</details>



This glossary defines codebase-specific terms, jargon, and architectural concepts used within the Void project. As Void is a fork of VS Code, it inherits much of the VS Code terminology while introducing specific abstractions for LLM integration.

## Core Architectural Concepts

### Contrib Layer
In VS Code architecture, "contrib" (short for contribution) refers to the modular parts of the workbench that add specific functionality. Void's primary logic is encapsulated within the `void` contribution.
*   **Location**: `src/vs/workbench/contrib/void` [[.voidrules:3-3]()]
*   **Constraint**: Developers are generally restricted from modifying files outside of this directory to maintain a clean separation from the upstream VS Code core [[.voidrules:12-12]()]

### Layering
A strict architectural pattern enforced by ESLint rules to prevent circular dependencies and ensure that high-level UI components do not directly depend on low-level system services without going through the appropriate channels.
*   **Implementation**: Enforced via `code-layering.ts` [[.eslint-plugin-local/code-layering.ts:8-19]()]
*   **Structure**: Common layers include `common` (platform-agnostic), `browser` (UI/DOM), `node` (OS access), and `electron-main` (main process).

### Service Brand
A TypeScript pattern used for Dependency Injection (DI) in VS Code. It uses a unique property `_serviceBrand` to identify service interfaces at runtime.
*   **Convention**: In Void, these are declared as `undefined` to satisfy the type system without overhead [[.eslint-plugin-local/code-declare-service-brand.ts:17-25]()]

## Data & Naming Conventions

### bOfA Mapping
A project-specific naming convention for maps or lookup tables. If a variable maps from Type A to Type B, it must be named `bOfA`.
*   **Example**: A map from `toolId` to `toolName` would be named `toolNameOfToolId` [[.voidrules:14-14]()]

### Service Decoration
The mechanism by which services are injected into classes. Services are identified by a decorator created via `createDecorator`.
*   **Usage**: Functions or classes request services by using the decorator as a parameter type in the constructor.

## Process Model

Void operates across multiple processes, inheriting the VS Code multi-process architecture.

| Process | Responsibility |
| :--- | :--- |
| **Main Process** | Manages window lifecycle, file system access, and native OS integrations. |
| **Renderer Process** | Handles the UI (React/VS Code Workbench) and user interactions. |
| **Shared Process** | Background tasks like extension hosting and heavy LLM processing. |

### Process Interaction Diagram
The following diagram illustrates how the Void-specific logic bridges the Renderer and Main processes via IPC (Inter-Process Communication).

"Void Process Interaction"
```mermaid
graph TD
    subgraph "Renderer Process (UI)"
        ["SidebarChat.tsx"] -- "calls" --> ["IChatThreadService"]
        ["IChatThreadService"] -- "triggers" --> ["ISendLLMMessageService"]
    end

    subgraph "IPC Bridge"
        ["ISendLLMMessageService"] -- "invoke" --> ["LLMChannel"]
    end

    subgraph "Main Process"
        ["LLMChannel"] -- "routes to" --> ["LLMMainService"]
        ["LLMMainService"] -- "executes" --> ["ProviderImplementation"]
    end

    ["ProviderImplementation"] -- "HTTP Request" --> ["External LLM API"]
```
Sources: [[.voidrules:3-6]()]

## Development Environment Jargon

### DevContainer
A pre-configured Docker environment that includes all necessary dependencies (Node.js, Python, Rust, etc.) to build and run Void.
*   **VNC Access**: The DevContainer forwards ports `6080` (noVNC) and `5901` (TCP) to allow viewing the Void UI inside a headless container [[.devcontainer/devcontainer.json:39-48]()]
*   **Memory Requirement**: Requires a minimum of 9GB of RAM [[.devcontainer/devcontainer.json:50-52]()]

### WinGet DSC
Desired State Configuration files used to automate the setup of Windows development environments.
*   **Dependencies**: Includes Git, Node.js 20, Python 3.10, and Visual Studio 2022 Build Tools [[.configurations/configuration.dsc.yaml:10-35]()]

## System Mapping: Natural Language to Code

This table maps common domain concepts to their implementation identifiers in the codebase.

| Concept | Code Entity / File Path | Description |
| :--- | :--- | :--- |
| **Chat State** | `IChatThreadService` | Manages the lifecycle of conversation threads. |
| **LLM Dispatch** | `sendLLMMessage` | The central entry point for sending prompts to AI providers. |
| **Code Editing** | `IEditCodeService` | Handles the application of LLM-generated diffs to the editor. |
| **Settings** | `VoidSettingsService` | Manages provider keys, model selection, and user preferences. |
| **Layering Rules** | `code-layering.ts` | ESLint rule preventing architectural violations [[.eslint-plugin-local/code-layering.ts:15-19]()] |

### Code Entity Relationship Diagram
This diagram shows how the core Void services relate to the VS Code workbench structure.

"Void Core Service Relationships"
```mermaid
classDiagram
    class "IWorkbenchContribution" {
        <<interface>>
    }
    class "VoidWorkbenchContribution" {
        +registerActions()
        +initServices()
    }
    class "IChatThreadService" {
        +threads: IChatThread[]
        +sendMessage(threadId)
    }
    class "IEditCodeService" {
        +applyDiff(edits)
        +streamChanges()
    }
    class "ISendLLMMessageService" {
        +send(payload)
    }

    "IWorkbenchContribution" <|-- "VoidWorkbenchContribution"
    "VoidWorkbenchContribution" ..> "IChatThreadService" : "initializes"
    "IChatThreadService" --> "ISendLLMMessageService" : "uses"
    "IEditCodeService" --> "ISendLLMMessageService" : "uses"
```
Sources: [[.voidrules:3-6]()]

## Tools and Utilities

*   **TSUP**: Used for bundling the React-based UI components into the VS Code workbench.
*   **Tailwind (Scoped)**: Void uses Tailwind for styling UI components, but it is scoped to prevent CSS leakage into the rest of the VS Code UI.
*   **Local ESLint Plugins**: Custom rules like `code-layering` and `code-declare-service-brand` ensure the fork remains maintainable and consistent with VS Code's internal standards [[.eslint-plugin-local/code-declare-service-brand.ts:8-15](), [.eslint-plugin-local/code-layering.ts:15-20]()].