# Command Line Interface

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/minisweagent/run/mini.py](src/minisweagent/run/mini.py)
- [tests/run/test_cli_integration.py](tests/run/test_cli_integration.py)
- [tests/run/test_local.py](tests/run/test_local.py)
- [tests/run/test_run_hello_world.py](tests/run/test_run_hello_world.py)
- [tests/test_data/update_outputs_local.py](tests/test_data/update_outputs_local.py)

</details>



The Command Line Interface (CLI) provides the primary entry point for interacting with `mini-swe-agent`. The system exposes two main executables: `mini` for running the agent interactively in a local environment, and `mini-extra` for administrative tasks, configuration management, batch evaluations, and trajectory inspection.

For details on individual sub-topics, see the child pages:
- [mini Command](#3.1)
- [mini-extra Utilities](#3.2)
- [Interactive Modes](#3.3)

---

## CLI Overview and Architecture

The CLI is built using `typer` and `rich` to provide an interactive and responsive terminal experience [src/minisweagent/run/mini.py:10-12](). The entry point script `src/minisweagent/run/mini.py` handles argument parsing, configuration loading, and component instantiation.

```mermaid
graph TB
    subgraph "Natural Language Space"
        CLI_USER["User CLI Invocation"]
        TASK_INPUT["Task Description"]
    end

    subgraph "Code Entity Space"
        MAIN_FUNC["minisweagent.run.mini:main()"]
        CONFIG_MERGE["minisweagent.utils.serialize:recursive_merge()"]
        MODEL_FACTORY["minisweagent.models:get_model()"]
        ENV_FACTORY["minisweagent.environments:get_environment()"]
        AGENT_FACTORY["minisweagent.agents:get_agent()"]
    end

    CLI_USER -->|"invokes"| MAIN_FUNC
    TASK_INPUT -->|"parsed via"| MAIN_FUNC
    MAIN_FUNC -->|"merges config"| CONFIG_MERGE
    CONFIG_MERGE -->|"instantiates"| MODEL_FACTORY
    CONFIG_MERGE -->|"instantiates"| ENV_FACTORY
    CONFIG_MERGE -->|"instantiates"| AGENT_FACTORY
```

Sources: [src/minisweagent/run/mini.py:54-105](), [src/minisweagent/utils/serialize.py:20]()

---

## 3.1 mini Command

The `mini` command is the main execution engine of `mini-swe-agent`. It parses command-line arguments, merges configuration files and overrides using `recursive_merge` [src/minisweagent/run/mini.py:92](), acquires the task statement (either via `--task` or an interactive prompt) [src/minisweagent/run/mini.py:60](), [src/minisweagent/run/mini.py:94-97](), and initializes the agent run loop [src/minisweagent/run/mini.py:102]().

For comprehensive documentation on options (`--model`, `--task`, `--yolo`, `--config`, `--output`, etc.), configuration merging rules, and usage examples, see [mini Command](#3.1).

Sources: [src/minisweagent/run/mini.py:54-106]()

---

## 3.2 mini-extra Utilities

The `mini-extra` utility suite provides subcommands for workflows outside of standard single-instance execution. This includes global configuration management, batch execution on benchmarks like SWE-bench and ProgramBench, single-instance debugging, and trajectory inspection.

```mermaid
graph TB
    subgraph "Natural Language Space"
        EXTRA_USER["mini-extra CLI"]
    end

    subgraph "Code Entity Space"
        EXTRA_MAIN["minisweagent.run.utilities.mini_extra:main()"]
        CFG_CMD["Config Subcommand"]
        SW_CMD["SWE-bench Batch Evaluation"]
        PB_CMD["ProgramBench Integration"]
        INS_CMD["Trajectory Inspector"]
    end

    EXTRA_USER -->|"dispatches"| EXTRA_MAIN
    EXTRA_MAIN --> CFG_CMD
    EXTRA_MAIN --> SW_CMD
    EXTRA_MAIN --> PB_CMD
    EXTRA_MAIN --> INS_CMD
```

For detailed documentation on each utility subcommand (`config`, `swebench`, `swebench-single`, `programbench`, `inspector`), see [mini-extra Utilities](#3.2).

Sources: [src/minisweagent/run/utilities/mini_extra.py]()

---

## 3.3 Interactive Modes

When running `mini`, the agent operates within configurable execution modes that govern how actions are validated and executed. Users can dynamically switch between confirmation modes, fully autonomous YOLO modes, and human-in-the-loop control using built-in slash commands.

For details on confirm/yolo/human modes, available slash commands, and mode-switching behavior, see [Interactive Modes](#3.3).

Sources: [src/minisweagent/run/mini.py:61](), [src/minisweagent/run/mini.py:79]()