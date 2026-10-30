# Report templates

## Analyze: `output/planning/<project>/analysis.md`

Fill every section. Write "None." in a section with nothing to report;
never drop a section.

````markdown
# Plan analysis: <project>

- Date: <ISO 8601>
- Documents: <each document read, with path or issue number>
- Not checked: <optional input absent and the check skipped, e.g. "no story issue", "Pass G skipped: no ADRs">, or "None."

## Findings

| ID | Category | Severity | Location | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| D1 | Principle alignment | CRITICAL | plan.md:31 | "Co-Authored-By: Claude" trailer breaks Principle VII. | Remove the convention. |
| E1 | Coverage gap | CRITICAL | idea-honing.md:14 | REQ-3 (resume) has no task; the list is useless without it. | Add a task for REQ-3. |

<Overflow line, if more than 50 findings.>

## Coverage

| Requirement | Has task? | Tasks | Notes |
| --- | --- | --- | --- |
| REQ-1 | Yes | step01/task-01 | Explicit ID. |
| REQ-3 | No | — | Blocks baseline function. |

## Principle issues

- <Principle number and rule>: <finding IDs>, or "None."

## Unmapped tasks

- <task path>: <why it maps to nothing>, or "None."

## Metrics

| Metric | Value |
| --- | --- |
| Requirements | <n> |
| Tasks | <n> |
| Coverage | <n>% (<covered>/<total>) |
| Ambiguity findings | <count of B findings> |
| Duplication findings | <count of A findings> |
| Critical findings | <n> |

## Next actions

- <"Resolve D1 and E1 before code-assist." or "code-assist may proceed.">
- <Suggestion per remaining HIGH or MEDIUM finding, naming the document
  or workflow to change: pdd design step, plan, code-task-generator.>

Want concrete fixes drafted for the top <N> findings? None will be applied
without approval.
````

When a core document is missing, the report holds only the header, the
findings table (one CRITICAL *Missing document* row per absent file),
"Coverage: not computed" in place of the coverage table and metrics, and a
next action naming the workflow that produces the missing file.

## Converge: summary in chat

````markdown
## Convergence: <project>

| ID | Status | Severity | Source | Evidence | Remaining work |
| --- | --- | --- | --- | --- | --- |
| V1 | unmet | CRITICAL | REQ-3 | `rg -n "resume" web/` → no matches | Resume a session from the list. |
| V2 | partial | HIGH | step02/task-01 AC1 | web/SessionList.tsx:40 filters, case-sensitive | Make title filter case-insensitive. |

Checked: <n> requirements, <n> acceptance criteria, <n> tasks, <n> principles.
Met: <n> · Partial: <n> · Unmet: <n>
````

## Converge: appended task file

One file per partial or unmet item in
`output/tasks/<project>/stepNN/task-NN-<slug>.code-task.md`, in the
`code-task-generator` format with these fields filled:

````markdown
# Task: <imperative title>

## Description
<What is still missing, and why it matters.>

## Background
- Source: <requirement key, task path and criterion, or Principle N>
- Status: <partial | unmet>
- Severity: <CRITICAL | HIGH | MEDIUM | LOW>
- Evidence: <file:line, or command and output>
- Found by: plan-analysis converge, <ISO 8601 date>

## Reference Documentation
**Required:**
- Design: output/planning/<project>/design/detailed-design.md

## Technical Requirements
1. <…>

## Dependencies
- <Existing tasks or code this builds on.>

## Implementation Approach
1. <…>

## Acceptance Criteria

1. **<Criterion>**
   - Given <precondition>
   - When <action>
   - Then <expected result>

## Metadata
- **Complexity**: <Low | Medium | High>
- **Labels**: convergence, <…>
- **Required Skills**: <…>
````
