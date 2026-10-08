import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
  type ActivityState,
  type ToolInput,
  initialActivityState,
  reduce,
  toActivity,
} from "./activity.ts";
import { renderCard } from "./render.ts";
import { type Clock, type PresenceScheduler, createScheduler } from "./scheduler.ts";
import { createXhayperTransport } from "./transport.ts";
import { type PresenceLink, createPresenceLink } from "./link.ts";
import { loadGlobalConfig, loadProjectConfig, resolveEnablement } from "./config.ts";
import {
  type DesiredPresence,
  type EpochMillis,
  type RuntimeToggle,
  type SessionContext,
  MIN_INTERVAL_MS,
  epochNow,
  modelName,
  projectNameFromCwd,
} from "./types.ts";

const shortModel = (model: unknown): string => {
  const obj = model && typeof model === "object" ? (model as Record<string, unknown>) : {};
  const raw =
    typeof obj.name === "string" ? obj.name : typeof obj.id === "string" ? obj.id : "model";
  return raw.split("/").pop() ?? raw;
};

const toolInput = (args: unknown): ToolInput => {
  const obj = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  return {
    path: typeof obj.path === "string" ? obj.path : undefined,
    command: typeof obj.command === "string" ? obj.command : undefined,
  };
};

// OMP-managed clock: ctx.setTimeout contains throws and is cleared on
// session_shutdown. Raw timers escape extension isolation and can take down
// the host session, so the scheduler is never given one here.
const ctxClock = (ctx: ExtensionContext): Clock => ({
  now: () => Date.now() as EpochMillis,
  schedule: (delayMs, fn) => {
    const timer = ctx.setTimeout(fn, delayMs);
    return () => ctx.clearTimer(timer);
  },
});

export default function registerDiscordPresence(omp: ExtensionAPI): void {
  let state: ActivityState = initialActivityState();
  let session: SessionContext | undefined;
  let host: ExtensionContext | undefined;
  let scheduler: PresenceScheduler | undefined;
  let link: PresenceLink | undefined;
  let runtimeToggle: RuntimeToggle;
  let active = false;

  // The model line reads the live session model on every render: OMP has no
  // model_select event, and /model can change it at any point between ticks.
  const render = (): DesiredPresence => {
    if (!session) return { kind: "cleared" };
    const model = modelName(shortModel(host?.models.current() ?? host?.model));
    return { kind: "card", card: renderCard(toActivity(state), { ...session, model }) };
  };

  const tick = (): void => {
    if (active && scheduler) scheduler.request(render());
  };

  const start = (ctx: ExtensionContext): void => {
    if (ctx.mode !== "tui") return; // TUI only (Q9)
    // Subagent sessions rebind extension factories; only the top-level agent
    // owns the Discord slot.
    if (ctx.agent.kind !== "main") return;
    host = ctx;
    const global = loadGlobalConfig();
    // OMP has no per-directory trust gate: project-local config is always loaded.
    const projectOverride = loadProjectConfig(ctx.cwd);
    if (!resolveEnablement({ global, projectOverride, runtimeToggle })) {
      active = false;
      return;
    }
    session = {
      project: projectNameFromCwd(ctx.cwd),
      model: modelName(shortModel(ctx.models.current() ?? ctx.model)),
      startedAt: epochNow(),
      petBaseUrl: global.petBaseUrl,
    };
    const transport = createXhayperTransport();
    link = createPresenceLink({ transport, clientId: global.clientId });
    const boundLink = link;
    scheduler = createScheduler({
      clock: ctxClock(ctx),
      minIntervalMs: MIN_INTERVAL_MS,
      push: (desired) => boundLink.push(desired),
    });
    state = initialActivityState();
    active = true;
    tick(); // initial idle card → triggers the first connect attempt
  };

  const stop = async (): Promise<void> => {
    if (scheduler) {
      scheduler.stop();
      scheduler = undefined;
    }
    if (link) {
      await link.push({ kind: "cleared" }).catch(() => undefined);
      await link.disconnect();
      link = undefined;
    }
    active = false;
    session = undefined;
    host = undefined;
  };

  omp.on("session_start", async (_event, ctx) => {
    await stop();
    start(ctx);
  });
  omp.on("session_shutdown", async () => {
    await stop();
  });

  omp.on("tool_execution_start", async (event) => {
    state = reduce(state, {
      type: "tool_start",
      toolName: event.toolName,
      input: toolInput(event.args),
    });
    tick();
  });
  omp.on("tool_execution_end", async (event) => {
    state = reduce(state, { type: "tool_end", toolName: event.toolName });
    tick();
  });
  omp.on("turn_start", async () => {
    state = reduce(state, { type: "thinking" });
    tick();
  });
  omp.on("turn_end", async () => {
    state = reduce(state, { type: "turn_end" });
    tick();
  });
  omp.on("agent_end", async () => {
    state = reduce(state, { type: "agent_end" });
    tick();
  });

  omp.registerCommand("presence", {
    description: "Toggle Discord rich presence: /presence on|off|status",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim().toLowerCase();
      if (arg === "on") {
        runtimeToggle = true;
        if (!active) start(ctx);
        else tick();
        ctx.ui.notify("Discord presence: on", "info");
      } else if (arg === "off") {
        runtimeToggle = false;
        await stop();
        ctx.ui.notify("Discord presence: off", "info");
      } else {
        ctx.ui.notify(`Discord presence: ${active ? "on" : "off"}`, "info");
      }
    },
  });
}
