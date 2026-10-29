# Skills, Prompt Templates, and Context Files

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [packages/coding-agent/docs/skills.md](packages/coding-agent/docs/skills.md)
- [packages/coding-agent/examples/extensions/dynamic-tools.ts](packages/coding-agent/examples/extensions/dynamic-tools.ts)
- [packages/coding-agent/src/core/skills.ts](packages/coding-agent/src/core/skills.ts)
- [packages/coding-agent/src/core/system-prompt.ts](packages/coding-agent/src/core/system-prompt.ts)
- [packages/coding-agent/test/agent-session-dynamic-tools.test.ts](packages/coding-agent/test/agent-session-dynamic-tools.test.ts)
- [packages/coding-agent/test/fixtures/skills/root-skill-preferred/SKILL.md](packages/coding-agent/test/fixtures/skills/root-skill-preferred/SKILL.md)
- [packages/coding-agent/test/fixtures/skills/root-skill-preferred/nested-child/SKILL.md](packages/coding-agent/test/fixtures/skills/root-skill-preferred/nested-child/SKILL.md)
- [packages/coding-agent/test/sdk-session-manager.test.ts](packages/coding-agent/test/sdk-session-manager.test.ts)
- [packages/coding-agent/test/skills.test.ts](packages/coding-agent/test/skills.test.ts)
- [packages/coding-agent/test/system-prompt.test.ts](packages/coding-agent/test/system-prompt.test.ts)

</details>



Behavior in `pi` is shaped by three primary resource types: **Skills**, **Prompt Templates**, and **Context Files**. These resources enable on-demand capability loading, reusable command expansions, and project-specific grounding to influence agent behavior and prompt construction.

For detailed technical dives into system prompt composition, skill standards, and project-local configurations, refer to the following child pages:

- [System Prompt, Skills, and Context Discovery](#8.1) — `system-prompt.ts` composition, Skills (`SKILL.md`, Agent Skills standard, on-demand loading), `AGENTS.md`/`CLAUDE.md` auto-discovery, `SYSTEM.md` and `APPEND_SYSTEM.md` overrides.
- [Project-Local .pi Directory and Dogfooding Setup](#8.2) — The repository's own `.pi/` directory conventions, prompt templates (`is.md`, `pr.md`, `wr.md`, `cl.md`), local extensions, skills, and maintainer dogfooding workflows.

Sources: [packages/coding-agent/docs/skills.md:3-7](), [packages/coding-agent/src/core/system-prompt.ts:1-32]().

---

## Skills

Skills are self-contained capability packages adhering to the [Agent Skills specification](https://agentskills.io/specification). They provide specialized instructions, helper scripts, references, and assets designed for particular workflows or domains. Instead of loading all details eagerly, Pi advertises skills by name and brief description in the system prompt and loads full instructions on-demand only when relevant tasks invoke them [packages/coding-agent/docs/skills.md:3-7]().

### Discovery and Loading

Skills are discovered recursively across configured directories, treating any directory containing a `SKILL.md` as a skill root. The discovery respects ignore files like `.gitignore` and `.ignore` to filter paths [packages/coding-agent/src/core/skills.ts:16-64](), [packages/coding-agent/src/core/skills.ts:168-221](). Validation enforces name and description conventions per the Agent Skills spec, warns on malformed or missing fields, and skips skills without valid descriptions [packages/coding-agent/src/core/skills.ts:92-127]().

At startup, Pi collects skill metadata (name, description, location) to include in the system prompt, keeping detailed skill instructions out of context until explicitly loaded or triggered by a user command such as `/skill:name` [packages/coding-agent/docs/skills.md:41-45]().

For full discovery precedence, error handling, and skill loading pipelines, see [System Prompt, Skills, and Context Discovery](#8.1).

### Skills Discovery and Prompt Integration Diagram

Title: "Skill Discovery and Prompt Integration"
```mermaid
graph TD
    subgraph "NaturalLanguageSpace"
        XML[""XML list of skill descriptions in System Prompt""]
        SYS[""System Prompt context""]
    end

    subgraph "CodeEntitySpace"
        Harness[""AgentHarness / ResourceLoader""]
        SK[""loadSkillsFromDir()""]
        VAL[""validateName() / validateDescription()""]
        FMT[""formatSkillsForPrompt()""]
    end

    subgraph "FilesystemSpace"
        F1[""~/.pi/agent/skills/my-skill/SKILL.md""]
        F2["".pi/skills/project-skill/SKILL.md""]
        F3[""node_modules/pkg/skills/skill/SKILL.md""]
    end

    F1 --> SK
    F2 --> SK
    F3 --> SK
    SK --> VAL
    VAL --> Harness
    Harness --> FMT
    FMT --> XML
    XML --> SYS
```

Sources: [packages/coding-agent/src/core/skills.ts:168-221](), [packages/coding-agent/docs/skills.md:24-82](), [packages/coding-agent/src/core/system-prompt.ts:67-67]().

---

## Prompt Templates

Prompt Templates are reusable Markdown files containing text with embedded argument placeholders. They facilitate rapid expansion of slash commands into structured user messages or system instructions. 

The repository and project-local `.pi/` directory often contain prompt templates like `is.md` (issue summary), `pr.md` (pull request), `wr.md` (write), and `cl.md` (changelog), which agents use to guide tasks or interact with the user.

For detailed discovery rules, parsing, and example workflows involving prompt templates, see [Project-Local .pi Directory and Dogfooding Setup](#8.2).

Sources: [packages/coding-agent/docs/skills.md:3-7]().

---

## Context Files

Context Files include project-specific instructions, guidelines, or overrides that ground the agent in the user's working context. These files, such as `AGENTS.md` or `CLAUDE.md` comprising project heuristics, and system-level overrides like `SYSTEM.md` and `APPEND_SYSTEM.md`, are loaded and incorporated into the system prompt.

The `buildSystemPrompt` function in `packages/coding-agent/src/core/system-prompt.ts` assembles the final system prompt by layering:

- Custom or forced prompt text
- Tool descriptions and usage guidelines
- Available skills formatted as XML
- Appended user or project instructions
- Current working directory context

This modular prompt construction enables fine-grained dynamic updates to prompt sections during an agent session [packages/coding-agent/src/core/system-prompt.ts:10-157]().

### Context Files Assembly Diagram

Title: "System Prompt Construction from Context Files"
```mermaid
graph LR
    subgraph "Filesystem"
        AGENTS[""AGENTS.md / CLAUDE.md (Project Context)""]
        SYSTEM[""SYSTEM.md (Custom Prompt)""]
        APPEND[""APPEND_SYSTEM.md (Append to System Prompt)""]
    end

    subgraph "CodeEntitySpace"
        BSPO[""BuildSystemPromptOptions""]
        BSP[""buildSystemPrompt()""]
        LSK[""Skills (from loadSkills())""]
        TOOLS[""Tools (selectedTools, toolSnippets)""]
        GUIDELINES[""Prompt Guidelines (promptGuidelines)""]
    end

    subgraph "NaturalLanguageSpace"
        FINAL_PROMPT[""Final System Prompt String""]
    end

    AGENTS --> BSPO
    SYSTEM --> BSPO
    APPEND --> BSPO
    LSK --> BSPO
    TOOLS --> BSPO
    GUIDELINES --> BSPO

    BSPO --> BSP
    BSP --> FINAL_PROMPT
```

Sources: [packages/coding-agent/src/core/system-prompt.ts:28-168](), [packages/coding-agent/test/system-prompt.test.ts:15-169]().

---

## Implementation Summary

| Resource Type          | Discovery File(s)                  | Parsing Logic                | Prompt Injection Point                                                        |
|-----------------------|----------------------------------|-----------------------------|-------------------------------------------------------------------------------|
| **Skill**             | `SKILL.md`                       | `loadSkillsFromDir`          | XML block formatted by `formatSkillsForPrompt` included in system prompt      |
|                       |                                  |                             | [packages/coding-agent/src/core/skills.ts:168-221]()                         |
| **Prompt Template**   | `*.md` files in `prompts/` or `.pi/` | Template substitution logic | Expanded as user message text via slash commands                              |
| **Context File**      | `AGENTS.md`, `CLAUDE.md`          | Loaded as project context    | Embedded inside `<project_context>` section of system prompt                  |
| **System Prompt Overrides** | `SYSTEM.md`, `APPEND_SYSTEM.md` | Custom prompt or append text | Replace or append the main system prompt                                     |

Sources:
- [packages/coding-agent/src/core/skills.ts:11-127]()
- [packages/coding-agent/src/core/system-prompt.ts:28-168]()
- [packages/coding-agent/docs/skills.md:24-41]()

---

## Child Pages

- [System Prompt, Skills, and Context Discovery](#8.1) — `system-prompt.ts` composition, Skills (`SKILL.md`, Agent Skills standard, on-demand loading), `AGENTS.md`/`CLAUDE.md` auto-discovery, `SYSTEM.md` and `APPEND_SYSTEM.md` overrides.
- [Project-Local .pi Directory and Dogfooding Setup](#8.2) — The repository's own `.pi/` directory: prompt templates (`is.md`, `pr.md`, `wr.md`, `cl.md`), local extensions (`import-repro.ts`), skills, and how maintainers use pi on pi during development and issue triage.