# Skein Agent Skill install

The canonical project skill lives in `.agents/skills/skein/` and follows the Agent Skills open format.

For agents that support project-local skills, keep the directory as-is in the repository.

For user-level installation, copy the `skein` directory into the skill directory used by your agent/client.

The skill uses progressive disclosure:

- `SKILL.md` — activation metadata and core workflow;
- `references/syntax.md` — application syntax and API;
- `references/architecture.md` — runtime internals, only for framework work;
- `evals/evals.json` — representative prompts and expected behavior.

Machine-readable framework discovery starts at `/llms.txt` on the Skein website.
