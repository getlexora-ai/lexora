@AGENTS.md

# Working the issue backlog

When asked to look at "all the issues", prioritise **from the list command
alone — do not read issue bodies/context first**:

```
gh issue list --repo getlexora-ai/lexora --state open \
  --json number,title,url,labels
```

Every issue carries three label dimensions: type (`bug` `feature`
`improvement` `docs` `chore`), `impact:high|medium|low`, and `size:S|M|L`.

1. Rank the whole backlog on those labels only — e.g. high impact first, or
   smallest size first, or best impact-to-size ratio, per what was asked.
2. Pick the target(s).
3. **Only then** open that issue's body (`gh issue view <n>`) to go deep on
   context, Possible fixes, and Items affected.

Skipping straight to reading every body defeats the label system — the labels
exist so triage/prioritisation costs zero context.

# File blockers immediately

If you — an agent, a subagent, or any workflow — hit a problem that cannot be
fixed within the current session (a bug outside the task's scope, a missing
capability, a broken dependency, a design flaw, a blocker you have to work
around), **file it to GitHub right away via the `triage-idea` skill** before
moving on. Do not just mention it in the reply and drop it.

- Use the skill's normal flow: classify type, assign `impact:*` / `size:*`,
  dedup-search, write the Context → Metrics → Items affected → Rationale →
  Possible fixes body, `gh issue create` on `getlexora-ai/lexora`.
- In **Context**, note it was surfaced automatically while doing other work and
  what that work was.
- Then carry on with the original task and report the issue number alongside
  your result.
