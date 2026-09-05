/**
 * The four data fragments, as recovered log records.
 *
 * Owner-supplied and reproduced VERBATIM. These are the payload of the entire
 * hunt -- a team carries what they read here into the physical case study --
 * so the words are not paraphrased, softened or reordered. The only editorial
 * change is typographic: the source wrote the yield as LaTeX (`$7 \times
 * 10^{134}$`), rendered here as real characters because players read this on
 * a phone with no maths typesetter.
 *
 * Keyed by PROGRESS INDEX (1-4), never by station. Routes are randomised per
 * team, so keying on progress is what guarantees all 150 teams read the same
 * four records in the same order and reach the same conclusion. The server
 * sends `fragment_index` on a correct answer; look it up here.
 *
 * Each record is structured rather than one prose blob so it can render as an
 * actual terminal readout -- the header in the machine's own voice, then
 * labelled fields. That formatting is doing narrative work: these are meant to
 * read as salvaged system logs nobody intended the crew to see.
 */

export const FRAGMENT_COUNT = 4

export const FRAGMENTS = {
  1: {
    index: 1,
    label: 'Fragment I',
    header: 'CORRUPTED LOG: ORIGIN_SCAN',
    fields: [
      { key: 'SUBJECT', value: 'Ultimate Power: Genesis' },
      {
        key: 'ANALYSIS',
        value:
          'The scattering is non-natural. Origin point traces back to an artificial tachyon resonance.',
      },
      { key: 'INITIAL IMPACT YIELD', value: '7 × 10¹³⁴ Joules.' },
      {
        key: 'NOTE',
        value: 'Anomalous energy magnitude matches no known natural cosmic event.',
      },
    ],
  },
  2: {
    index: 2,
    label: 'Fragment II',
    header: 'SYSTEM WARNING: DEPLOYMENT CALIBRATION',
    tone: 'warning',
    fields: [
      {
        key: 'ERROR',
        value:
          'Assembling the theoretical ULTIMATE POWER at Earth yields 100% probability of False Vacuum Collapse.',
      },
      {
        key: 'CAUSE',
        value: 'Instability of standard linear timeflow at current coordinates.',
      },
      {
        key: 'RESOLUTION',
        value:
          'To safely stabilize the tachyon matrix, the launch conduit must be relocated to an environment of absolute infinite spacetime curvature.',
      },
    ],
  },
  3: {
    index: 3,
    label: 'Fragment III',
    header: 'DIRECTIVE: CAUSALITY INSULATION',
    tone: 'warning',
    fields: [
      {
        key: 'WARNING',
        value:
          'Artificial temporal alterations will result in timeline erasure if external observers are present.',
      },
      {
        key: 'MANDATE',
        value:
          'Upon execution of tachyon pulse, excess energy must be vented backward along the timeline to preserve the loop.',
      },
      {
        key: 'TARGET',
        value:
          'Vent as a scattering of fragments across the cosmos [T-minus zero]. Blind the origin point to maintain causal stability.',
      },
    ],
  },
  4: {
    index: 4,
    label: 'Fragment IV',
    header: 'CRITICAL HARDWARE FAILURE',
    tone: 'critical',
    fields: [
      { key: 'SUBJECT', value: 'Execution Conduit' },
      {
        key: 'STATUS',
        value:
          'No mechanical construct can withstand the dual tachyon-scattering sequence without disintegrating.',
      },
      {
        key: 'REQUIREMENT',
        value:
          'Execution demands an Omniversal biological conduit capable of localized reality manipulation.',
      },
      { key: 'DNA BIOMARKER REQUIRED', value: 'Celestialsapien.' },
      { key: 'SYSTEM OVERRIDE', value: 'Awaiting Form X.' },
    ],
  },
}

export const FRAGMENT_LABELS = Object.fromEntries(
  Object.values(FRAGMENTS).map((f) => [f.index, f.label]),
)

/**
 * The closing line shown once all four are recovered.
 *
 * ⚠️ OWNER COPY STILL PENDING. The four records above assemble into the twist
 * on their own -- the Ultimate Power can only be assembled inside a black
 * hole, and the scattering the prologue calls "an ancient force" was its own
 * exhaust, vented backward at T-0 by the crew that is now collecting it --
 * but the final wording a team carries into the case study has not been
 * supplied, and inventing it here would put words into the event's mouth.
 * Until it is filled in, the Fragments tab shows the four records in sequence
 * and says plainly that the conclusion is theirs to draw.
 */
export const ASSEMBLED_MESSAGE = null

/** How many fragments a team has earned. Derived from the server's progress. */
export function unlockedFragmentCount(progress) {
  return Math.max(0, Math.min(FRAGMENT_COUNT, progress || 0))
}

/**
 * Defensive by design: an index outside 1-4 (a replayed response, a future
 * stop count) must return null rather than render "undefined" at a team.
 */
export function getFragment(index) {
  return FRAGMENTS[index] || null
}
