// pAIr's "the meeting happened": what the card shows after the server answers. Pure, so a test can
// pin it. The card switches to "done" because the member pressed and the server said ok, not
// because a time came back: a missing time used to leave the big button up (QA, pAIr PR 2, m3).

/** The confirmation time to show after a successful press: the server's, else the moment of the press. */
export function confirmedAfter(on: boolean, serverAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!on) return null;
  return serverAt || now.toISOString();
}
