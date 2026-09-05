export function Badge({ status }) {
  const styles = {
    active: 'bg-accent/15 text-accent border-accent/30',
    locked: 'bg-amber/15 text-amber border-amber/30',
    finished: 'bg-green/15 text-green border-green/30',
  }

  const labels = {
    active: 'Active',
    locked: 'Locked',
    finished: 'Finished',
  }

  return (
    <span
      className={`inline-block text-[12px] font-semibold px-2 py-0.5 rounded-md border ${
        styles[status] || styles.active
      }`}
    >
      {labels[status] || status}
    </span>
  )
}
