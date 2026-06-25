export function formatPaceSeconds(value) {
  const total = Number(value)
  if (!Number.isFinite(total) || total <= 0) return '-'

  const minutes = Math.floor(total / 60)
  const seconds = total - minutes * 60
  const secondsText = Number.isInteger(seconds)
    ? String(seconds)
    : seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')

  return minutes > 0 ? `${minutes}분 ${secondsText}초` : `${secondsText}초`
}
