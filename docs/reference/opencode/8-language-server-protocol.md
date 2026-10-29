# Language Server Protocol

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [README.md](README.md)
- [cmd/root.go](cmd/root.go)
- [internal/app/app.go](internal/app/app.go)
- [internal/config/config.go](internal/config/config.go)

</details>



OpenCode integrates with Language Server Protocol (LSP) servers to provide code intelligence features to AI agents. The system manages multiple concurrent LSP clients, each connected to a different language server (e.g., `gopls` for Go, `typescript-language-server` for TypeScript). LSP diagnostics are exposed to the AI through the `diagnostics` tool, enabling context-aware code assistance.

For information about how AI agents access LSP data, see the `diagnostics` tool in [File System Tools](#6.1). For details about permission requirements for LSP operations, see [Security and Permissions](#7).

## System Overview

The LSP integration operates as a background service layer that starts during application initialization and runs throughout the session. The system architecture consists of three core subsystems:

1. **Configuration and Initialization** - LSP servers are configured in `.opencode.json` and initialized in background goroutines during app startup
2. **Client Management** - Each `lsp.Client` manages a single language server process with RPC communication
3. **Workspace Watching** - The `WorkspaceWatcher` monitors filesystem changes and maintains file synchronization with LSP servers

**Sources:** [README.md:570-608](), [internal/config/config.go:64-70](), [internal/app/app.go:33-60]()

### Configuration and Initialization Flow

```mermaid
graph TB
    subgraph "Configuration Layer"
        ConfigFile[".opencode.json"]
        LSPConfig["config.LSPConfig<br/>{Command, Args, Options}"]
        ConfigLoad["config.Load()"]
    end
    
    subgraph "Application Initialization"
        AppNew["app.New()"]
        initLSPClients["initLSPClients(ctx)"]
        GoRoutine["Background goroutine<br/>per language"]
    end
    
    subgraph "Client Lifecycle"
        createAndStartLSPClient["createAndStartLSPClient()"]
        NewClient["lsp.NewClient()"]
        InitializeLSPClient["InitializeLSPClient()"]
        WaitForServerReady["WaitForServerReady()"]
    end
    
    subgraph "Runtime State"
        AppLSPClients["App.LSPClients<br/>map[string]*lsp.Client"]
        Client["lsp.Client<br/>{conn, openFiles, diagnostics}"]
        WorkspaceWatcher["watcher.WorkspaceWatcher"]
    end
    
    subgraph "External Processes"
        LSPServer["Language Server Process<br/>(gopls, typescript-language-server, etc.)"]
    end
    
    ConfigFile --> ConfigLoad
    ConfigLoad --> LSPConfig
    
    AppNew --> initLSPClients
    LSPConfig --> initLSPClients
    initLSPClients --> GoRoutine
    GoRoutine --> createAndStartLSPClient
    
    createAndStartLSPClient --> NewClient
    createAndStartLSPClient --> InitializeLSPClient
    createAndStartLSPClient --> WaitForServerReady
    createAndStartLSPClient --> WorkspaceWatcher
    
    NewClient --> LSPServer
    InitializeLSPClient --> LSPServer
    
    createAndStartLSPClient --> AppLSPClients
    AppLSPClients --> Client
    Client --> LSPServer
    
    WorkspaceWatcher --> Client
```

The initialization process follows this sequence:

1. **Configuration Loading** - `config.Load()` reads `lsp` section from `.opencode.json`, creating `LSPConfig` entries for each language
2. **Background Initialization** - `app.New()` calls `initLSPClients()` which spawns a goroutine for each configured language server
3. **Client Creation** - Each goroutine calls `createAndStartLSPClient()` to spawn the LSP server process and establish communication
4. **Handshake** - `InitializeLSPClient()` performs the LSP initialization handshake with 30-second timeout
5. **Ready Validation** - `WaitForServerReady()` verifies server responsiveness with ping requests
6. **Storage** - Successfully initialized clients are stored in `App.LSPClients` map, keyed by language name

**Sources:** [internal/config/config.go:64-70](), [internal/app/app.go:42-80](), [cmd/root.go:100-105]()

## Client Management

The `lsp.Client` struct manages bidirectional communication with a single language server process. Each client maintains its own connection, file state, and diagnostic cache.

### Client Structure and State

The `lsp.Client` maintains several concurrent-safe data structures:

| Field | Type | Purpose |
|-------|------|---------|
| `openFiles` | `map[string]*OpenFileInfo` | Tracks open files with version numbers for change notifications |
| `diagnostics` | `map[protocol.DocumentUri][]protocol.Diagnostic` | Caches diagnostic messages received from server |
| `handlers` | `map[int32]chan *Message` | Correlates LSP responses to pending requests |
| `nextID` | `atomic.Int32` | Generates unique request IDs for RPC calls |
| `serverState` | `atomic.Value` | Tracks lifecycle state (Starting, Ready, Error) |
| `conn` | `*jsonrpc2.Conn` | JSON-RPC connection over stdin/stdout pipes |

The `OpenFileInfo` struct tracks per-file state:
- `URI` - Document URI in LSP format (`file:///path/to/file`)
- `Version` - Monotonically increasing version number for change notifications
- `Content` - Last known file content
- `LanguageID` - Language identifier (e.g., "go", "typescript")

**Sources:** [internal/lsp/client.go:22-53]()

### Lifecycle Phases

```mermaid
stateDiagram-v2
    [*] --> Creating: NewClient()
    Creating --> Initializing: Process spawned
    Initializing --> Handshaking: InitializeLSPClient()
    Handshaking --> Validating: initialize response
    Validating --> Ready: WaitForServerReady()
    Ready --> Operating: File operations
    Operating --> Operating: textDocument/* notifications
    Operating --> Shutdown: Close()
    Shutdown --> [*]: Process terminated
    
    Handshaking --> Error: Timeout (30s)
    Validating --> Error: Timeout (30s)
    Error --> [*]
```

| Phase | Function | Operations | Timeout |
|-------|----------|------------|---------|
| **Creating** | `NewClient()` | Spawns server process via `exec.Command()`, establishes stdin/stdout pipes | None |
| **Initializing** | `InitializeLSPClient()` | Sends `initialize` request with workspace root, receives server capabilities | 30s |
| **Validating** | `WaitForServerReady()` | Sends ping requests to verify server responsiveness | 30s |
| **Operating** | File operations | `OpenFile()`, `NotifyChange()`, `CloseFile()`, `GetDiagnostics()` | None |
| **Shutdown** | `Close()` | Sends `shutdown` and `exit` requests, terminates process | 2s |

**Sources:** [internal/lsp/client.go:55-115](), [internal/lsp/client.go:129-231](), [internal/lsp/client.go:287-341]()

### Server-Specific Optimizations

The system detects server types through `detectServerType()` which examines the command path to identify the language server. Different servers have different performance characteristics and benefit from different file loading strategies:

```mermaid
graph TB
    detectServerType["detectServerType(command)"]
    
    subgraph "Detection Logic"
        detectServerType --> CheckGo["Contains 'gopls'?"]
        CheckGo -->|Yes| ServerTypeGo["ServerTypeGo"]
        CheckGo -->|No| CheckTS["Contains 'typescript'<br/>or 'vtsls' or 'tsserver'?"]
        CheckTS -->|Yes| ServerTypeTypeScript["ServerTypeTypeScript"]
        CheckTS -->|No| CheckRust["Contains 'rust-analyzer'?"]
        CheckRust -->|Yes| ServerTypeRust["ServerTypeRust"]
        CheckRust -->|No| CheckPython["Contains 'pyright'<br/>or 'pylsp'?"]
        CheckPython -->|Yes| ServerTypePython["ServerTypePython"]
        CheckPython -->|No| ServerTypeGeneric["ServerTypeGeneric"]
    end
    
    subgraph "Loading Strategies"
        ServerTypeGo --> GoStrategy["Lazy load<br/>Max 50 files<br/>Priority: go.mod, go.sum"]
        ServerTypeTypeScript --> TSStrategy["Preload enabled<br/>Max 100 files<br/>Priority: tsconfig.json, package.json"]
        ServerTypeRust --> RustStrategy["Lazy load<br/>Max 50 files<br/>Priority: Cargo.toml, lib.rs"]
        ServerTypePython --> PythonStrategy["Lazy load<br/>Max 50 files<br/>Priority: pyproject.toml, __init__.py"]
        ServerTypeGeneric --> GenericStrategy["No preload<br/>On-demand only"]
    end
```

| Server Type | Preload Strategy | Max Files | Key Config Files |
|-------------|------------------|-----------|------------------|
| `ServerTypeGo` | Lazy | 50 | `go.mod`, `go.sum`, `main.go` |
| `ServerTypeTypeScript` | Eager | 100 | `tsconfig.json`, `package.json`, `index.ts` |
| `ServerTypeRust` | Lazy | 50 | `Cargo.toml`, `Cargo.lock`, `lib.rs`, `main.rs` |
| `ServerTypePython` | Lazy | 50 | `pyproject.toml`, `setup.py`, `__init__.py` |
| `ServerTypeGeneric` | None | 0 | None |

TypeScript's eager preloading helps with project-wide type checking, while Go and Rust perform better with lazy loading due to their different analysis models.

**Sources:** [internal/lsp/client.go:344-418]()

## Workspace Watching

The `watcher.WorkspaceWatcher` monitors filesystem changes and maintains file synchronization with LSP servers. It implements pattern-based filtering, debounced event handling, and server-specific file loading strategies.

### Watcher Architecture

```mermaid
graph TB
    subgraph "Initialization"
        WatchWorkspace["WatchWorkspace(ctx)"]
        fsnotifyNew["fsnotify.NewWatcher()"]
        watcherAdd["watcher.Add(workspaceRoot)"]
    end
    
    subgraph "Registration Processing"
        AddRegistrations["AddRegistrations(registrations)"]
        shouldPreloadFiles["shouldPreloadFiles(serverType)"]
        openHighPriorityFiles["openHighPriorityFiles(pattern)"]
        openMatchingFile["openMatchingFile(pattern)"]
    end
    
    subgraph "Event Loop"
        fsnotifyEvents["fsnotify.Event channel"]
        isPathWatched["isPathWatched(path, registration)"]
        debounceHandleFileEvent["debounceHandleFileEvent(event)"]
        handleFileEvent["handleFileEvent(event)"]
    end
    
    subgraph "Client Notification"
        notifyFileEvent["notifyFileEvent(uri, kind)"]
        ClientOpenFile["client.OpenFile(uri)"]
        ClientNotifyChange["client.NotifyChange(uri)"]
        ClientCloseFile["client.CloseFile(uri)"]
    end
    
    subgraph "Pattern Matching"
        matchesPattern["matchesPattern(path, globPattern)"]
        matchesGlob["matchesGlob(path, pattern)"]
        matchesSimpleGlob["matchesSimpleGlob(path, pattern)"]
    end
    
    WatchWorkspace --> fsnotifyNew
    fsnotifyNew --> watcherAdd
    WatchWorkspace --> AddRegistrations
    
    AddRegistrations --> shouldPreloadFiles
    shouldPreloadFiles --> openHighPriorityFiles
    shouldPreloadFiles --> openMatchingFile
    openHighPriorityFiles --> ClientOpenFile
    openMatchingFile --> ClientOpenFile
    
    watcherAdd --> fsnotifyEvents
    fsnotifyEvents --> isPathWatched
    isPathWatched --> matchesPattern
    matchesPattern --> matchesGlob
    matchesPattern --> matchesSimpleGlob
    
    isPathWatched --> debounceHandleFileEvent
    debounceHandleFileEvent --> handleFileEvent
    handleFileEvent --> notifyFileEvent
    
    notifyFileEvent --> ClientOpenFile
    notifyFileEvent --> ClientNotifyChange
    notifyFileEvent --> ClientCloseFile
```

The watcher implements a debouncing mechanism with 300ms delay to prevent excessive notifications during rapid file changes (e.g., during git operations or builds). The `debounceMap` stores pending timers indexed by file URI.

**Sources:** [internal/lsp/watcher/watcher.go:44-195](), [internal/lsp/watcher/watcher.go:306-450]()

### File Registration and Preloading

When LSP servers request file watching through `workspace/didChangeWatchedFiles` capability negotiation, the watcher receives glob patterns and decides whether to proactively open matching files:

```mermaid
graph TB
    AddRegistrations["AddRegistrations(registrations)"]
    
    subgraph "Decision Logic"
        shouldPreloadFiles["shouldPreloadFiles()"]
        CheckServerType["Check serverType"]
        CheckServerType --> IsTypeScript["ServerTypeTypeScript?"]
        IsTypeScript -->|Yes| PreloadTrue["Return true<br/>Eager loading"]
        IsTypeScript -->|No| PreloadFalse["Return false<br/>Lazy loading"]
    end
    
    subgraph "Preload Execution"
        PreloadTrue --> openHighPriorityFiles["openHighPriorityFiles(pattern)"]
        PreloadTrue --> openMatchingFile["openMatchingFile(pattern, maxFiles)"]
        openHighPriorityFiles --> WalkFS["filepath.WalkDir()"]
        openMatchingFile --> WalkFS
        WalkFS --> FilterFiles["Filter by pattern, size, extension"]
        FilterFiles --> ClientOpenFile["client.OpenFile(uri)"]
    end
    
    subgraph "Lazy Loading"
        PreloadFalse --> RegisterOnly["Store pattern only"]
        RegisterOnly --> OnDemandLater["Open on first diagnostic request"]
    end
    
    AddRegistrations --> shouldPreloadFiles
    shouldPreloadFiles --> CheckServerType
```

The preloading system enforces limits to prevent memory issues:
- Maximum file size: 5MB for watcher operations, 1MB for preloaded files
- Maximum files per pattern: 50-100 depending on server type
- Excluded directories: `node_modules`, `.git`, `dist`, `build`, `__pycache__`
- Excluded extensions: `.swp`, `.tmp`, `.log`, `.o`, `.so`, binary formats

**Sources:** [internal/lsp/watcher/watcher.go:197-304](), [internal/lsp/watcher/watcher.go:718-733](), [internal/lsp/watcher/watcher.go:933-987]()

## File State Synchronization

The `lsp.Client` provides methods for managing file lifecycle and content synchronization with language servers.

### File Lifecycle Operations

```mermaid
stateDiagram-v2
    [*] --> Closed: File not tracked
    Closed --> Open: OpenFile(path)
    Open --> Open: NotifyChange(path)
    Open --> Closed: CloseFile(path)
    
    note right of Open
        textDocument/didOpen sent
        Version = 1
        Content cached
    end note
    
    note right of Open
        textDocument/didChange sent
        Version incremented
        Content updated
    end note
    
    note left of Closed
        textDocument/didClose sent
        Removed from openFiles map
    end note
```

| Method | LSP Notification | Purpose | Version Handling |
|--------|------------------|---------|------------------|
| `OpenFile(path)` | `textDocument/didOpen` | Reads file content, adds to `openFiles` map, notifies server | Sets version to 1 |
| `NotifyChange(path)` | `textDocument/didChange` | Detects content changes, updates `openFiles`, notifies server | Increments version |
| `CloseFile(path)` | `textDocument/didClose` | Removes from `openFiles` map, notifies server | N/A |
| `OpenFileOnDemand(path)` | Same as `OpenFile` | Opens file only if not already open | Checks `openFiles` first |

The version number in `OpenFileInfo` is critical for LSP protocol compliance - servers use it to validate that change notifications correspond to the expected document state.

**Sources:** [internal/lsp/client.go:583-625](), [internal/lsp/client.go:627-664](), [internal/lsp/client.go:666-695](), [internal/lsp/client.go:744-754]()

### File Filtering

The watcher implements exclusion rules to prevent opening inappropriate files:

```mermaid
graph TB
    IncomingFile["File Event"]
    
    subgraph "Directory Checks"
        shouldExcludeDir["shouldExcludeDir(path)"]
        HiddenDir["Starts with '.'?"]
        ExcludedDirName["In excludedDirNames?"]
    end
    
    subgraph "File Checks"
        shouldExcludeFile["shouldExcludeFile(path)"]
        DotFile["Starts with '.'?"]
        ExcludedExt["In excludedFileExtensions?"]
        BinaryExt["In largeBinaryExtensions?"]
        FileSize["Size > maxFileSize?"]
    end
    
    subgraph "Exclusion Lists"
        excludedDirNames["excludedDirNames:<br/>node_modules, .git, dist,<br/>build, __pycache__, target"]
        excludedFileExtensions["excludedFileExtensions:<br/>.swp, .tmp, .log,<br/>.o, .so, .pyc"]
        largeBinaryExtensions["largeBinaryExtensions:<br/>.png, .jpg, .zip,<br/>.pdf, .exe, .dll"]
    end
    
    IncomingFile --> shouldExcludeDir
    shouldExcludeDir --> HiddenDir
    shouldExcludeDir --> ExcludedDirName
    ExcludedDirName --> excludedDirNames
    
    IncomingFile --> shouldExcludeFile
    shouldExcludeFile --> DotFile
    shouldExcludeFile --> ExcludedExt
    shouldExcludeFile --> BinaryExt
    shouldExcludeFile --> FileSize
    
    ExcludedExt --> excludedFileExtensions
    BinaryExt --> largeBinaryExtensions
    
    HiddenDir -->|Yes| Exclude["Exclude from watching"]
    ExcludedDirName -->|Yes| Exclude
    DotFile -->|Yes| Exclude
    ExcludedExt -->|Yes| Exclude
    BinaryExt -->|Yes| Exclude
    FileSize -->|Yes| Exclude
    
    HiddenDir -->|No| Include["Include in watching"]
    ExcludedDirName -->|No| Include
    DotFile -->|No| Include
    ExcludedExt -->|No| Include
    BinaryExt -->|No| Include
    FileSize -->|No| Include
```

Size limits prevent memory exhaustion:
- `maxFileSize` constant: 5MB for watcher file operations
- Preload file size limit: 1MB (enforced in `openMatchingFile()`)
- No limit on files opened by AI tools (those use on-demand loading)

**Sources:** [internal/lsp/watcher/watcher.go:737-854]()

## Diagnostic System

LSP servers publish diagnostics (errors, warnings, hints) through the `textDocument/publishDiagnostics` notification. The client caches these diagnostics and exposes them to AI tools through the `diagnostics` tool.

### Diagnostic Flow

```mermaid
sequenceDiagram
    participant LSPServer as "LSP Server"
    participant Client as "lsp.Client"
    participant DiagnosticsCache as "diagnostics map"
    participant Tool as "diagnostics tool"
    participant Agent as "AI Agent"
    
    LSPServer->>Client: textDocument/publishDiagnostics
    Note over LSPServer,Client: Server sends diagnostics<br/>asynchronously
    
    Client->>DiagnosticsCache: Store diagnostics<br/>by URI
    Note over Client,DiagnosticsCache: diagnostics[uri] = []Diagnostic
    
    Agent->>Tool: Execute diagnostics tool
    Tool->>Client: GetDiagnosticsForFile(path)
    
    alt File not open
        Client->>Client: OpenFileOnDemand(path)
        Client->>LSPServer: textDocument/didOpen
        LSPServer-->>Client: publishDiagnostics
        Client->>DiagnosticsCache: Update cache
    end
    
    Client->>DiagnosticsCache: Retrieve diagnostics
    DiagnosticsCache-->>Client: []Diagnostic
    Client-->>Tool: Return diagnostics
    Tool-->>Agent: Format as tool result
```

The diagnostic cache structure:
- Key: `protocol.DocumentUri` (e.g., `file:///path/to/file.go`)
- Value: `[]protocol.Diagnostic` containing severity, message, range, source, and code

Each `protocol.Diagnostic` includes:
- `Range` - Start/end line and character positions
- `Severity` - Error (1), Warning (2), Information (3), Hint (4)
- `Message` - Human-readable diagnostic message
- `Source` - Language server name (e.g., "gopls", "eslint")
- `Code` - Optional error code

**Sources:** [internal/lsp/client.go:732-785]()

### Diagnostic Access Methods

| Method | Behavior | Use Case |
|--------|----------|----------|
| `GetFileDiagnostics(uri)` | Returns cached diagnostics for URI, empty slice if not found | Quick lookup without side effects |
| `GetDiagnosticsForFile(path)` | Ensures file is open, waits briefly for diagnostics, returns results | AI tool queries needing guaranteed diagnostics |
| `ClearDiagnosticsForURI(uri)` | Removes diagnostics from cache | File deletion or major changes |

The `GetDiagnosticsForFile()` method implements a brief wait after opening files to allow servers to publish initial diagnostics, improving AI agent experience.

**Sources:** [internal/lsp/client.go:732-785]()

## Integration Points

The LSP system integrates with other OpenCode components through several key interfaces:

### Application Integration

The `App` manages LSP clients through coordinated lifecycle management with panic recovery and restart capabilities:

```mermaid
graph TB
    App["App"]
    
    subgraph "Client Management"
        initLSPClients["initLSPClients()"]
        createAndStartLSPClient["createAndStartLSPClient()"]
        runWorkspaceWatcher["runWorkspaceWatcher()"]
        restartLSPClient["restartLSPClient()"]
    end
    
    subgraph "Synchronization"
        watcherWG["watcherWG (WaitGroup)"]
        watcherCancelFuncs["watcherCancelFuncs []context.CancelFunc"]
        clientsMutex["clientsMutex sync.RWMutex"]
        LSPClients["LSPClients map[string]*Client"]
    end
    
    subgraph "Error Handling"
        RecoverPanic["logging.RecoverPanic()"]
        RestartLogic["Client restart logic"]
    end
    
    App --> initLSPClients
    initLSPClients --> createAndStartLSPClient
    createAndStartLSPClient --> runWorkspaceWatcher
    createAndStartLSPClient --> watcherWG
    createAndStartLSPClient --> watcherCancelFuncs
    createAndStartLSPClient --> clientsMutex
    createAndStartLSPClient --> LSPClients
    
    runWorkspaceWatcher --> RecoverPanic
    RecoverPanic --> restartLSPClient
    restartLSPClient --> RestartLogic
```

Key functions and their responsibilities:
- `initLSPClients()` - Iterates through configuration and starts all LSP clients in parallel goroutines
- `createAndStartLSPClient()` - Handles individual client lifecycle with 30-second initialization timeout
- `runWorkspaceWatcher()` - Manages workspace watching with panic recovery and automatic restart
- `restartLSPClient()` - Handles client failures, cleanup, and restart with 5-second shutdown timeout

**Sources:** [internal/app/lsp.go:13-126]()

### Configuration Integration

LSP clients are configured through the main configuration system with entries defining:
- Command path and arguments
- Server-specific settings
- Debug options (`DebugLSP` flag enables detailed logging)

The system supports multiple concurrent LSP servers, each with independent configuration and lifecycle management.

**Sources:** [internal/lsp/watcher/watcher.go:46-47](), [internal/app/lsp.go:14]()