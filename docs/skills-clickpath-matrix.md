# Skills Click-Path Matrix

Generated: 2026-02-20T12:30:55.454Z

This matrix picks one representative skill for each setup path currently used by policy metadata.

| Setup Path | Representative Skill | Policy Source | Skills In Path | Expected Click Path |
| --- | --- | --- | ---: | --- |
| `direct` | `canvas` | `skills/canvas/SKILL.md` | 9 | Enable toggle -> skill enables immediately with no setup. |
| `in-app-config` | `bluebubbles` | `skills/bluebubbles/SKILL.md` | 8 | Enable toggle -> DRAM asks for keys/config in-app -> DRAM retries enable. |
| `native-installer` | `bear-notes` | `skills/bear-notes/SKILL.md` | 14 | Enable toggle -> DRAM installs required runtimes -> DRAM runs installer -> DRAM enables skill. |
| `wsl-homebrew` | `1password` | `skills/1password/SKILL.md` | 22 | Enable toggle -> DRAM prepares Windows runtime layer -> DRAM installs dependency -> DRAM enables skill. |
| `manual` | `coding-agent` | `skills/coding-agent/SKILL.md` | 5 | Enable toggle -> DRAM applies automatic parts first -> DRAM explains remaining manual setup in-app. |

Total policies: 58
Setup paths covered: `direct`, `in-app-config`, `native-installer`, `wsl-homebrew`, `manual`
Setup paths without mapped skills: none
