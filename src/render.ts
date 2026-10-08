import type { Activity, AssetKey, PetClip, PresenceCard, ProjectName, SessionContext, SetActivityPayload } from "./types.ts";
import { GENERIC_ICON, petImageUrl } from "./types.ts";

const detailsFor = (a: Activity, project: ProjectName): string => {
  switch (a.kind) {
    case "editing":
      return `Editing ${a.file}`;
    case "reading":
      return `Reading ${a.file}`;
    case "searching":
      return "Searching the codebase";
    case "browsing":
      return "Browsing the web";
    case "running":
      return `Running: ${a.head}`;
    case "tool":
      return `Running ${a.toolName}`;
    case "thinking":
      return "Thinking…";
    case "idle":
      return `Idle in ${project}`;
  }
};

const smallIconFor = (a: Activity): { readonly key: AssetKey; readonly text: string } => {
  if (a.kind === "editing" || a.kind === "reading") {
    return { key: a.language.assetKey, text: a.language.label };
  }
  const text =
    a.kind === "running"
      ? "Shell"
      : a.kind === "searching"
        ? "Search"
        : a.kind === "browsing"
          ? "Web"
          : a.kind === "thinking"
            ? "Thinking"
            : "OMP";
  return { key: GENERIC_ICON, text };
};

/** Which pet animation matches what the agent is doing. */
const petClipFor = (a: Activity): PetClip => {
  switch (a.kind) {
    case "editing":
      return "typing";
    case "reading":
      return "reading";
    case "searching":
    case "browsing":
    case "running":
    case "tool":
      return "busy";
    case "thinking":
      return "thinking";
    case "idle":
      return "idle";
  }
};

export const renderCard = (a: Activity, ctx: SessionContext): PresenceCard => {
  const small = smallIconFor(a);
  return {
    details: detailsFor(a, ctx.project),
    state: `${ctx.project} · ${ctx.model}`,
    largeImage: petImageUrl(ctx.petBaseUrl, petClipFor(a)),
    largeText: "OMP Coding Agent",
    smallImage: small.key,
    smallText: small.text,
    startTimestamp: ctx.startedAt,
  };
};

export const toPayload = (card: PresenceCard): SetActivityPayload => ({
  details: card.details,
  state: card.state,
  startTimestamp: card.startTimestamp,
  largeImageKey: card.largeImage,
  largeImageText: card.largeText,
  smallImageKey: card.smallImage,
  smallImageText: card.smallText,
  instance: false,
});
