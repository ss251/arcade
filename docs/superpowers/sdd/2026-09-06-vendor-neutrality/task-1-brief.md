# Vendor neutrality — Task 1 wording brief

Owner-approved September 6, 2026; base d57a7e3. Root-only, four-worker maximum,
one sequential full gate for this commit. No agents, paid calls or push.

Use Agent Skill (open standard) for the portable SKILL.md input format in README,
seller documentation, web publishing copy, CLI help and manifest/engine comments.
Cite https://agentskills.io/specification. The same folder can run in Codex,
ChatGPT, Cursor, Copilot, Gemini CLI and Claude Code, subject to each client's
setup and available tools; ARCADE's manifest remains separate from that format.

The actual loader checks non-empty name and description (the specification's
two required frontmatter fields) and an executable non-empty instruction body.
Do not claim it validates every naming rule, parent-folder constraint or YAML
feature. Preserve actual engine identifiers, provider models, credential policy
and behavior. The existing skill adapter still executes through claude-agent.

Normalize format wording in selected historical public plan/spec/research copies,
with an explicit dated note. Preserve original private research and actual Git
history. Historical commit identifiers must remain exact; do not rewrite their
quoted subject as if Git changed. Replace the old subject quotation with a
clearly labeled format-neutral description and original commit hash instead.
Do not touch unrelated vendor SDK names, source commands or personal skill paths.

Write real help/render failures first; implement copy changes and documentation.
Review source AST for behavior preservation, run focused existing tests, then one
full max4 gate and web build. Commit only scoped source/docs/tests and this public
brief/report/ledger. H10/H14 owner decisions and later engines/plugins remain open.
