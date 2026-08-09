# loxitui Keyboard Reference

Complete keyboard shortcut reference for the loxitui terminal UI, organized by
context. Written for operators using the interactive TUI; for installation and
configuration see the [User Guide](user-guide.md).

The footer of the TUI always shows the most important hints:
`Tab/←→ switch panel · [/] group · ↑↓ navigate · n new · d delete · ^G AI sidebar · ^R refresh · ^F search · q quit`

---

## Global (main view)

Active whenever no modal dialog is open and the search bar is closed.

| Key | Action |
|---|---|
| `q` / `Esc` | Quit loxitui |
| `Tab` / `→` / `l` | Next panel (`l` acts as "next panel" everywhere except the Log panel — see below) |
| `←` / `h` | Previous panel |
| `[` / `]` | Previous / next tab **group** (OVERVIEW, NET, SEC, BGP, L2, IPSEC, AI) |
| `1` – `9` | Jump directly to a panel: `1` Dashboard, `2` Services, `3` Endpoints, `4` Conntrack, `5` Routes, `6` Cluster, `7` Trace, `8` Metrics, `9` Logs |
| `↑` / `k` | Move selection up in the current panel's list |
| `↓` / `j` | Move selection down in the current panel's list |
| `Ctrl+G` | Toggle the AI sidebar (optional feature — requires an AI provider; see [User Guide § AI Assistant](user-guide.md#6-ai-assistant-optional)) |
| `Ctrl+R` | Refresh all panel data now |
| `Ctrl+F` | Toggle the search bar for the current panel (not available on the Dashboard) |
| `:` | Open the command palette |
| `n` | New — open the create form (Services and Routes panels only) |
| `d` | Delete the selected item (Services and Routes panels only; asks for confirmation) |
| `Enter` | Toggle the selected trace flag (Trace panel only) |
| `l` | On the **Log panel**: run AI log analysis — sends the recent log lines to the AI sidebar (requires an AI provider) |

Notes:

- `q`/`Esc` quit only from the main view. When the AI sidebar is open, `Esc`
  closes the sidebar instead; when a search bar or modal is open, `Esc` closes
  that first.
- Mouse: the divider between panels and the AI sidebar can be dragged to
  resize the sidebar.

## Search bar (`Ctrl+F`)

While the search bar is open it captures all typing; only `Ctrl`-combinations
pass through to the global handler.

| Key | Action |
|---|---|
| *(printable characters)* | Append to the filter query (matches update live) |
| `Backspace` | Delete the last character |
| `Enter` | Close the search bar, keeping the filter applied |
| `Esc` / `Ctrl+F` | Close the search bar |

## Log viewer (Logs panel)

The Log panel streams the newest 100 lines from the LoxiLB `/logs` API and
auto-refreshes. Its footer shows the currently available keys.

| Key | Action |
|---|---|
| `↑` / `k` | Scroll up one line (leaves follow mode) |
| `↓` / `j` | Scroll down one line (returns to follow mode at the bottom) |
| `g` | Jump to the top of the loaded buffer |
| `G` | Jump to the tail and resume follow mode |
| `b` | Load one older page (100 lines) via the pagination cursor — shown as `[b] older` when more history exists |
| `r` | Reset: drop loaded history and return to the live tail |
| `l` | Send the recent log lines to the AI sidebar for analysis (requires an AI provider) |
| `Ctrl+F` | Search/filter log lines |

## AI sidebar (`Ctrl+G`)

Optional feature — requires an AI provider (`claude-cli` or `ollama`). All
other shortcuts in this document work without one.

| Key | Action |
|---|---|
| *(printable characters)* | Type into the prompt input |
| `Backspace` | Delete the last character |
| `Enter` | Send the message |
| `↑` / `↓` | Scroll the conversation |
| `PgUp` / `PgDn` | Scroll the conversation by 20 lines |
| `Ctrl+C` | Cancel the in-flight response (abort streaming) |
| `Ctrl+L` | Clear the conversation history |
| `Ctrl+R` | Regenerate the last response |
| `Esc` | Close the sidebar |

## Forms (Create LB Service, Create Route)

Opened with `n` on the Services or Routes panel. The LB service form is a
multi-step wizard (service arguments → endpoints → confirm).

| Key | Action |
|---|---|
| *(printable characters)* | Type into the focused field |
| `Backspace` | Delete the last character in the focused field |
| `Tab` / `↓` | Focus the next field |
| `Shift+Tab` / `↑` | Focus the previous field |
| `Enter` | Advance to the next step / submit on the final step |
| `Esc` | Go back one step; from the first step, cancel and close the form |

## Delete confirmation dialog

Opened with `d` on the Services or Routes panel.

| Key | Action |
|---|---|
| `y` / `Enter` | Confirm deletion |
| `n` / `Esc` | Cancel |

## Command palette (`:`)

| Key | Action |
|---|---|
| *(printable characters)* | Type a command |
| `Enter` | Execute the command (`help` or `?` opens the help overlay) |
| `↑` / `↓` | Browse command history (last 20 entries) |
| `Backspace` | Delete a character; on an empty input, close the palette |
| `Esc` | Close the palette |

Help overlay (after entering `help` or `?`):

| Key | Action |
|---|---|
| `↑` / `k`, `↓` / `j` | Scroll the help text |
| `Esc` / `Enter` | Close |

---

Back to the [User Guide](user-guide.md) · [YAML Configuration Management](yaml-config.md) · [README](../README.md)
