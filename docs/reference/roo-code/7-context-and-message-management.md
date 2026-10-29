# 7. Context and Message Management

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/__tests__/command-mentions.spec.ts](src/__tests__/command-mentions.spec.ts)
- [src/core/condense/__tests__/condense.spec.ts](src/core/condense/__tests__/condense.spec.ts)
- [src/core/condense/__tests__/foldedFileContext.spec.ts](src/core/condense/__tests__/foldedFileContext.spec.ts)
- [src/core/condense/__tests__/index.spec.ts](src/core/condense/__tests__/index.spec.ts)
- [src/core/condense/__tests__/nested-condense.spec.ts](src/core/condense/__tests__/nested-condense.spec.ts)
- [src/core/condense/__tests__/rewind-after-condense.spec.ts](src/core/condense/__tests__/rewind-after-condense.spec.ts)
- [src/core/condense/foldedFileContext.ts](src/core/condense/foldedFileContext.ts)
- [src/core/condense/index.ts](src/core/condense/index.ts)
- [src/core/context-management/__tests__/context-management.spec.ts](src/core/context-management/__tests__/context-management.spec.ts)
- [src/core/context-management/__tests__/truncation.spec.ts](src/core/context-management/__tests__/truncation.spec.ts)
- [src/core/context-management/index.ts](src/core/context-management/index.ts)
- [src/core/mentions/__tests__/processUserContentMentions.spec.ts](src/core/mentions/__tests__/processUserContentMentions.spec.ts)
- [src/core/mentions/index.ts](src/core/mentions/index.ts)
- [src/core/mentions/processUserContentMentions.ts](src/core/mentions/processUserContentMentions.ts)
- [src/core/task/Task.ts](src/core/task/Task.ts)
- [src/core/task/__tests__/Task.spec.ts](src/core/task/__tests__/Task.spec.ts)
- [src/core/tools/RunSlashCommandTool.ts](src/core/tools/RunSlashCommandTool.ts)
- [src/core/tools/SkillTool.ts](src/core/tools/SkillTool.ts)
- [src/core/tools/__tests__/runSlashCommandTool.spec.ts](src/core/tools/__tests__/runSlashCommandTool.spec.ts)
- [src/core/webview/__tests__/webviewMessageHandler.delete.spec.ts](src/core/webview/__tests__/webviewMessageHandler.delete.spec.ts)
- [src/services/skills/__tests__/skillInvocation.spec.ts](src/services/skills/__tests__/skillInvocation.spec.ts)

</details>



## Purpose and Scope

This page documents Roo Code's context and message management system, which handles conversation history storage, context window optimization, `@mention` processing, and environment data collection. The system maintains dual message stores for API and UI purposes, automatically manages context limits through condensation and truncation, and enriches user input with workspace context via @mentions.

For details on the implementation of these systems, see:
- [Message History and Dual Storage](#7.1)
- [Context Window Management](#7.2)
- [Context Mentions System](#7.3)
- [Environment and Diagnostic Collection](#7.4)

---

## Dual Message Storage Architecture

Roo Code maintains two parallel message stores with distinct purposes to ensure UI responsiveness while adhering to strict LLM API protocols.

| Storage | Type | Purpose | Persistence | Location |
|---------|------|---------|-------------|----------|
| `apiConversationHistory` | `ApiMessage[]` | Messages sent to/from LLM API | File system | `.roo-code/tasks/{taskId}/api_conversation_history.json` |
| `clineMessages` | `ClineMessage[]` | UI display and user interaction | File system | `.roo-code/tasks/{taskId}/ui_messages.json` |

**Dual Storage Rationale**

```mermaid
graph TB
    "UserInput[User Input]"
    "APIHistory[apiConversationHistory<br/>(ApiMessage[])]"
    "ClineMessages[clineMessages<br/>(ClineMessage[])]"
    "LLMProvider[ApiHandler.createMessage()]"
    "WebviewUI[Webview UI (React)]"
    "Validator[validateAndFixToolResultIds]"
    
    "UserInput" --> "APIHistory"
    "UserInput" --> "ClineMessages"
    
    "APIHistory" --> "LLMProvider"
    "LLMProvider" --> "APIHistory"
    
    "ClineMessages" --> "WebviewUI"
    "WebviewUI" --> "ClineMessages"
    
    "APIHistory" -.-> "Validator"
    "Validator" -.-> "ClineMessages"
```

**Title:** Dual Message Storage Flow

For details, see [Message History and Dual Storage](#7.1).

Sources: [src/core/task/Task.ts:111-117](), [src/core/task/Task.ts:309-310](), [src/core/task-persistence/index.ts:1-15]()

---

## Context Window Management

Roo Code manages context limits through two primary mechanisms: **Condensation** (intelligent summarization) and **Truncation** (sliding window fallback).

### Context Condensation (Auto-summary)

When context usage exceeds configured thresholds, `summarizeConversation()` is triggered to compress history while preserving active intent.

- **Thresholds:** Controlled by `autoCondenseContextPercent` and `profileThresholds` [src/core/context-management/index.ts:184-187]().
- **Command Preservation:** The system extracts `<command>` blocks using `extractCommandBlocks()` to ensure active workflows (like mode switching or custom commands) are not lost during summarization [src/core/condense/index.ts:187-210]().
- **Rewind Safety:** `cleanupAfterTruncation()` clears `condenseParent` tags if the summary message is deleted, reactivating original messages for the API [src/core/condense/index.ts:316-335](). This fixes issues where rewinding past a condensation point would otherwise leave "orphaned" hidden messages [src/core/condense/__tests__/rewind-after-condense.spec.ts:17-30]().

### Forced Truncation (Sliding Window)

If an API returns a `context_length_exceeded` error, `truncateConversation()` performs non-destructive sliding window truncation [src/core/context-management/index.ts:67-70]().

- **FORCED_REDUCTION:** Retains 75% of context by tagging the oldest 25% with a `truncationParent` ID [src/core/task/Task.ts:138-140]().
- **Marker:** Inserts a `isTruncationMarker` message to track the boundary in the UI [src/core/context-management/index.ts:113-119]().

For details, see [Context Window Management](#7.2).

Sources: [src/core/condense/index.ts:111-124](), [src/core/context-management/index.ts:161-190](), [src/core/condense/index.ts:241-280](), [src/core/condense/index.ts:316-335]()

---

## @Mentions System

The mention system allows users to reference various context sources inline. The `parseMentions` function transforms user text into structured `MentionContentBlock` objects [src/core/mentions/index.ts:99-113]().

### Supported Mention Types

| Mention Type | Syntax | Content Provided |
|-------------|--------|------------------|
| File | `@/path/file.ts` | File contents via `extractTextFromFileWithMetadata` |
| Folder | `@/path/` | Recursive file list and content via `getFileOrFolderContentWithMetadata` |
| Problems | `@problems` | VS Code diagnostics via `diagnosticsToProblemsString` |
| Git Changes | `@git-changes` | Current working directory diff via `getWorkingState` |
| Terminal | `@terminal` | Latest terminal output buffer via `getLatestTerminalOutput` |
| URL | `@http://...` | Fetched URL content |
| Slash Command | `/command` | Project-specific command or skill instructions [src/core/mentions/index.ts:117-135]() |

### Mention Resolution Pipeline

```mermaid
graph TB
    "InputText[User Text with @mentions]"
    "Parse[parseMentions()]"
    "UserContent[processUserContentMentions()]"
    
    subgraph "Context Resolution"
        "FileRes[getFileOrFolderContentWithMetadata()]"
        "GitRes[getWorkingState() / getCommitInfo()]"
        "DiagRes[diagnosticsToProblemsString()]"
        "TermRes[getLatestTerminalOutput()]"
        "SkillRes[resolveSkillContentForMode()]"
    end
    
    "CleanText[Text with clean path refs]"
    "Blocks[MentionContentBlock[]]"
    
    "InputText" --> "UserContent"
    "UserContent" --> "Parse"
    "Parse" --> "FileRes"
    "Parse" --> "GitRes"
    "Parse" --> "DiagRes"
    "Parse" --> "TermRes"
    "Parse" --> "SkillRes"
    
    "FileRes" --> "Blocks"
    "GitRes" --> "Blocks"
    "DiagRes" --> "Blocks"
    "TermRes" --> "Blocks"
    "SkillRes" --> "Blocks"
    "Parse" --> "CleanText"
```

**Title:** Mention Resolution Pipeline

For details, see [Context Mentions System](#7.3).

Sources: [src/core/mentions/index.ts:46-64](), [src/core/mentions/index.ts:163-181](), [src/core/mentions/processUserContentMentions.ts:36-56](), [src/core/mentions/index.ts:128-135]()

---

## Environment and Diagnostic Collection

The system enriches the AI's context with real-time environment data to improve task accuracy.

- **Diagnostics:** Collected via `vscode.languages.getDiagnostics()`. These are formatted into a "Problems" string for the model [src/core/mentions/index.ts:393-410]().
- **Git Integration:** Provides the model with visibility into current changes and commit history [src/core/mentions/index.ts:173-176]().
- **Workspace Tracking:** The `FileContextTracker` monitors which files are mentioned or edited, providing metadata for context optimization [src/core/context-tracking/FileContextTracker.ts:1-30]().
- **Environment Details:** `getEnvironmentDetails()` aggregates OS, shell, and workspace info into the system prompt [src/core/environment/getEnvironmentDetails.ts:1-20]().

For details, see [Environment and Diagnostic Collection](#7.4).

Sources: [src/core/environment/getEnvironmentDetails.ts:1-20](), [src/core/mentions/index.ts:416-457]()

---

## Key Components

| Component | Responsibility |
|-----------|----------------|
| `Task` | Orchestrates dual-storage, synchronization, and task lifecycle [src/core/task/Task.ts:162-180](). |
| `manageContext` | High-level controller for condensation and truncation [src/core/context-management/index.ts:16-18](). |
| `summarizeConversation` | Generates synthetic summary messages to free up context window [src/core/condense/index.ts:241-250](). |
| `parseMentions` | Resolves `@` symbols and `/` commands into `MentionContentBlock`s [src/core/mentions/index.ts:99-109](). |
| `processUserContentMentions` | Processes mentions specifically within `<user_message>` feedback tags [src/core/mentions/processUserContentMentions.ts:36-46](). |
| `MessageManager` | Manages the assembly and validation of message sequences [src/core/task/Task.ts:132](). |

Sources: [src/core/task/Task.ts:162-180](), [src/core/context-management/index.ts:16-18](), [src/core/condense/index.ts:241-250](), [src/core/mentions/index.ts:99-109]()