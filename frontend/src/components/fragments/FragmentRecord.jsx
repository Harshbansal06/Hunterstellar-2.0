/**
 * The body of one recovered log: its lines, and nothing else.
 *
 * Per the Figma design (RWVG6TMWF7heyZh2xKAZDA, node 41:292) this is now a
 * plain run of monospace paragraphs. Three things were removed, and each
 * removal is the point rather than a simplification of it:
 *
 *   The field keys (WARNING / MANDATE / TARGET). At 10px muted grey beside
 *   14px primary values they had stopped reading as labels, and the lines say
 *   what they are without being told.
 *
 *   The bracketed header line. The card's own title is the header now, so
 *   printing a second one inside it was the same job done twice.
 *
 *   The tone stripe. See the note on `tone` below.
 *
 * The record no longer draws its own frame or title, so the surrounding card
 * owns both. That is what lets the Fragments deck, the reveal and the finish
 * screen show the same artefact with three different chrome treatments.
 *
 * NOTE ON `tone`: fragments still carry `notice | warning | critical` in
 * content/fragments.js, and nothing renders it any more. The design drops it,
 * which means severity is no longer visible anywhere. Left in the data rather
 * than deleted, because re-adding a signal is cheap and re-authoring content
 * is not.
 */
export function FragmentRecord({ fragment, dense = false }) {
  if (!fragment) return null

  const lines = fragment.fields ?? []
  if (lines.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {lines.map((field) => (
        <p
          key={field.key}
          className={`font-mono ${
            dense ? 'text-[11.5px] leading-[18px]' : 'text-[12px] leading-[19.5px]'
          } text-text-primary [word-break:break-word]`}
        >
          {field.value}
        </p>
      ))}
    </div>
  )
}

export default FragmentRecord
