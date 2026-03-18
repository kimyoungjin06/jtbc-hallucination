import { readFileSync } from "node:fs";

const DEFAULT_ROUND_ID = "philosophy-r1";
const CASES = {
  "philosophy-r1": JSON.parse(
    readFileSync(new URL("../data/philosophy-r1.json", import.meta.url), "utf8")
  ),
  "case01-r1": JSON.parse(
    readFileSync(new URL("../data/case01-r1.json", import.meta.url), "utf8")
  ),
  "case02-r1": JSON.parse(
    readFileSync(new URL("../data/case02-r1.json", import.meta.url), "utf8")
  ),
  "case03-r1": JSON.parse(
    readFileSync(new URL("../data/case03-r1.json", import.meta.url), "utf8")
  ),
  "case04-r1": JSON.parse(
    readFileSync(new URL("../data/case04-r1.json", import.meta.url), "utf8")
  )
};

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getRoundBlueprint(roundId = DEFAULT_ROUND_ID) {
  const resolvedRoundId = CASES[roundId] ? roundId : DEFAULT_ROUND_ID;
  const caseEvents = CASES[resolvedRoundId];
  const phaseTemplate = caseEvents.find((event) => event.event_id === "evt_0016");
  const operatorTemplate = caseEvents.find((event) => event.event_id === "evt_0017");
  const publicTemplate = caseEvents.find((event) => event.event_id === "evt_0018");

  if (!phaseTemplate || !operatorTemplate || !publicTemplate) {
    throw new Error(`${resolvedRoundId} decision templates are incomplete.`);
  }

  return {
    roundId: resolvedRoundId,
    rawEvents: caseEvents,
    preInterruptEvents: caseEvents.filter((event) => event.seq <= 15),
    phaseTemplate,
    operatorTemplate,
    publicTemplate
  };
}
