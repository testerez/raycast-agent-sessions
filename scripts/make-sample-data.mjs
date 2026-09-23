#!/usr/bin/env node
/**
 * Generates a self-contained fake session tree used for the Raycast Store screenshots,
 * so no personal transcript, repository or branch name ever ends up in the store listing.
 *
 * Layout (root defaults to $TMPDIR/agent-sessions-sample, override with argv[2]):
 *   <root>/home/.claude/projects/<encoded-cwd>/<uuid>.jsonl   Claude Code transcripts
 *   <root>/home/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl     Codex rollouts
 *   <root>/repos/<name>/.git/config                            fake origins => project sections
 *   <root>/desktop/<account>/<org>/local_<uuid>.json           Claude Desktop pin/archive flags
 *
 * Point the extension at it with `scripts/screenshot-mode.patch`, then run `npm run dev`.
 */
import { mkdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = process.argv[2] ?? join(tmpdir(), "agent-sessions-sample");
const HOME = join(root, "home");
const CLAUDE_PROJECTS = join(HOME, ".claude", "projects");
const CODEX_SESSIONS = join(HOME, ".codex", "sessions");
const DESKTOP = join(root, "desktop", "sample-account", "sample-org");

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

function write(file, text, mtimeMs) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  const s = mtimeMs / 1000;
  utimesSync(file, s, s);
}

/**
 * Working directories are deliberately fake paths that do not exist on this machine, so the
 * detail pane shows a neutral path. The project section still reads `acme/storefront` because
 * the repository comes from the transcript itself: `pr-link.prRepository` for Claude Code,
 * `session_meta.git.repository_url` for Codex.
 */
const PAYMENTS = "/Users/alex/code/payments";
const DOTFILES = "/Users/alex/code/dotfiles";
const ORIGIN = "https://github.com/meridian/payments.git";
const PR_REPO = "meridian/payments";

const encode = (cwd) => cwd.replace(/[/.]/g, "-");
const uuid = (n) => `0000${String(n).padStart(4, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** One Claude Code transcript. */
function claudeSession(s) {
  const id = uuid(s.n);
  const lines = [];
  const at = (i) => iso(s.updated - (s.turns.length - i) * 4 * 60_000);
  if (s.title) lines.push({ type: "custom-title", customTitle: s.title, timestamp: at(0) });
  if (s.pr)
    lines.push({
      type: "pr-link",
      prNumber: s.pr,
      prUrl: `https://github.com/${s.prRepo}/pull/${s.pr}`,
      prRepository: s.prRepo,
      timestamp: at(0),
    });
  s.turns.forEach((turn, i) => {
    const base = { sessionId: id, cwd: s.cwd, gitBranch: s.branch, timestamp: at(i), version: "2.1.0" };
    lines.push({ ...base, type: "user", message: { role: "user", content: turn[0] } });
    lines.push({
      ...base,
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: turn[1] }] },
    });
  });
  write(
    join(CLAUDE_PROJECTS, encode(s.cwd), `${id}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    s.updated,
  );
  if (s.pinned || s.archivedDesktop) {
    write(
      join(DESKTOP, `local_${id}.json`),
      JSON.stringify({
        cliSessionId: id,
        name: s.title,
        isStarred: !!s.pinned,
        isArchived: !!s.archivedDesktop,
        updatedAt: iso(s.updated),
      }),
      s.updated,
    );
  }
}

/** One Codex rollout. */
function codexSession(s) {
  const id = uuid(s.n);
  const d = new Date(s.updated);
  const pad = (v) => String(v).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const lines = [];
  const at = (i) => iso(s.updated - (s.turns.length - i) * 4 * 60_000);
  lines.push({
    timestamp: at(0),
    type: "session_meta",
    payload: {
      id,
      timestamp: at(0),
      cwd: s.cwd,
      originator: "codex_cli_rs",
      cli_version: "0.51.0",
      git: { branch: s.branch, repository_url: s.origin },
    },
  });
  if (s.title)
    lines.push({
      timestamp: at(0),
      type: "event_msg",
      payload: { type: "thread_name_updated", thread_name: s.title },
    });
  s.turns.forEach((turn, i) => {
    lines.push({
      timestamp: at(i),
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: turn[0] }] },
    });
    lines.push({
      timestamp: at(i),
      type: "response_item",
      payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: turn[1] }] },
    });
  });
  write(
    join(
      CODEX_SESSIONS,
      String(d.getFullYear()),
      pad(d.getMonth() + 1),
      pad(d.getDate()),
      `rollout-${stamp}-${id}.jsonl`,
    ),
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    s.updated,
  );
}

rmSync(root, { recursive: true, force: true });

// --- Section 1: a personal repo with no remote, so it groups under its directory name.
const dot = [
  {
    title: "Zsh startup takes 400ms",
    ago: 6 * HOUR,
    pinned: true,
    turns: [
      [
        "My shell takes almost half a second to start. Find out what is slow.",
        "`zprof` puts 310ms in nvm's init. Lazy-loading it behind a shell function brings startup down to 90ms.",
      ],
      ["Does that still pick up the .nvmrc in a project?", "Yes — the wrapper reads .nvmrc on the first node/npm call."],
    ],
  },
  {
    title: "Fzf keybinding for switching branches",
    ago: 7 * HOUR,
    turns: [
      [
        "Add a keybinding that fuzzy-finds a git branch and checks it out.",
        "Bound to ctrl-b: it lists local branches by last commit date, previews the log, and checks out the selection.",
      ],
    ],
  },
  {
    title: "Move Homebrew casks into the Brewfile",
    ago: 26 * HOUR,
    archivedDesktop: true,
    turns: [
      [
        "Half my casks are installed by hand. Get them into the Brewfile so a new machine is one command.",
        "Dumped the current state into the Brewfile, dropped the four casks you no longer have installed, and left a note about the two Mac App Store apps `mas` has to handle.",
      ],
    ],
  },
];
dot.forEach((s, i) =>
  claudeSession({ n: 10 + i, cwd: DOTFILES, branch: "main", updated: now - s.ago, ...s }),
);

// --- Section 2: the work repo, mixed Claude Code and Codex sessions.
claudeSession({
  n: 20,
  cwd: PAYMENTS,
  branch: "claude/open-prs-filter-a94c86",
  title: "My PRs",
  pr: 904,
  prRepo: PR_REPO,
  pinned: true,
  updated: now - 25 * HOUR,
  turns: [
    [
      "List my open pull requests grouped by whether CI is green.",
      "Four are open: two green and waiting on review, one red on the e2e job, one still running.",
    ],
    ["Drop the drafts.", "Three left. #904 is the oldest at nine days, still unreviewed."],
  ],
});

claudeSession({
  n: 21,
  cwd: PAYMENTS,
  branch: "claude/refund-dupe-fork-4b9b8a",
  title: "Refund webhook fires twice (fork)",
  pr: 832,
  prRepo: PR_REPO,
  updated: now - 3 * HOUR,
  turns: [
    [
      "Fork of the refund work: try the unique index on the delivery id instead of the advisory lock in PR #832.",
      "The index is simpler and survives a restart mid-batch. Inserting on conflict do nothing makes the replayed delivery a no-op.",
    ],
    [
      "What happens to a refund that legitimately repeats?",
      "It has its own delivery id, so it still goes through — only the same delivery replayed is dropped.",
    ],
  ],
});

claudeSession({
  n: 22,
  cwd: PAYMENTS,
  branch: "fix/refund-idempotency",
  title: "Refund webhook fires twice",
  pr: 832,
  prRepo: PR_REPO,
  updated: now - 5 * HOUR,
  turns: [
    [
      "Customers are getting refunded twice when the provider retries a webhook. See ENG-1793.",
      "The handler credits the account before it checks the delivery id, so a retry runs the whole thing again. I made the write idempotent and added a replay test.",
    ],
    [
      "Open a PR against main.",
      "Opened https://github.com/meridian/payments/pull/832 with the migration, the handler change and the test.",
    ],
  ],
});

codexSession({
  n: 23,
  cwd: PAYMENTS,
  branch: "main",
  origin: ORIGIN,
  title: null,
  updated: now - 28 * HOUR,
  turns: [
    [
      "go through the sentry issues from last night's deploy and tell me which ones are ours and which come from the payment provider. skip the ones already triaged.",
      "Nine new issues. Six are ours (four from the new refund path), three are provider timeouts that resolved on retry. Details per issue below.",
    ],
  ],
});

codexSession({
  n: 24,
  cwd: PAYMENTS,
  branch: "codex/pay-1982-log-redaction",
  origin: ORIGIN,
  title: "Stop logging raw card data in staging",
  updated: now - 3 * DAY,
  turns: [
    [
      "ENG-1982: staging logs still contain full card payloads. Make that impossible, not just fixed.",
      "Added a redacting serializer and a test that fails the build when a payment payload reaches the logger unredacted.",
    ],
  ],
});

codexSession({
  n: 25,
  cwd: PAYMENTS,
  branch: "codex/pay-1981-payout-approval",
  origin: ORIGIN,
  title: "Require a second approval for payouts over the daily cap",
  updated: now - 4 * DAY,
  turns: [
    [
      "ENG-1981: payouts above the daily cap should wait for a second operator before they leave the account.",
      "They now land in pending_approval and only settle once a different operator approves them; the cap is per account and configurable.",
    ],
  ],
});

claudeSession({
  n: 26,
  cwd: PAYMENTS,
  branch: "fix/invoice-rounding",
  title: "Invoice totals are off by one cent",
  pr: 811,
  prRepo: PR_REPO,
  updated: now - 6 * DAY,
  turns: [
    [
      "Invoice totals are a cent off whenever a line has a percentage discount.",
      "Each line was rounded before summing. Rounding once on the total fixes all eleven fixtures.",
    ],
  ],
});

claudeSession({
  n: 27,
  cwd: PAYMENTS,
  branch: "feat/provider-sdk-v4",
  title: "Migrate to the v4 provider SDK",
  pr: 780,
  prRepo: PR_REPO,
  updated: now - 8 * DAY,
  turns: [
    [
      "Move the checkout page to the v4 SDK, keep the old flow behind a flag.",
      "Both run side by side behind `checkout_v4`, which is on for internal accounts only.",
    ],
  ],
});

codexSession({
  n: 28,
  cwd: PAYMENTS,
  branch: "codex/pay-1975-flaky-e2e",
  origin: ORIGIN,
  title: "Flaky end-to-end test on the payout spec",
  updated: now - 10 * DAY,
  turns: [
    [
      "The payout end-to-end spec fails about one run in five on CI.",
      "It asserted on the toast before the request settled. Waiting on the request held across 50 runs.",
    ],
  ],
});

console.log(root);
