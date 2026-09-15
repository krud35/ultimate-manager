export default function SelectionIndicator({ selected, lang = 'pl' }) {
  return <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold" style={{ color: 'var(--um-accent)' }}>
    <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2" style={{ borderColor: selected ? 'var(--um-accent)' : 'var(--um-border)', backgroundColor: selected ? 'var(--um-accent)' : 'transparent', color: 'var(--um-on-accent, white)' }}>{selected ? '✓' : ''}</span>
    {selected && (lang === 'en' ? 'Selected' : 'Wybrano')}
  </span>
}
