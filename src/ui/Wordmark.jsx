export default function Wordmark({ compact = false }) {
  return <div className={`um-wordmark${compact ? ' um-wordmark--compact' : ''}`} aria-label="Ultimate Manager"><span>ULTIMATE</span><span>MANAGER.</span></div>
}
