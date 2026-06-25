function formatTimestamp(digits) {
  if (!digits) return ''
  if (digits.length <= 2) return digits
  if (digits.length === 3) return `${digits[0]}:${digits.slice(1)}`
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`
  if (digits.length === 5) return `${digits[0]}:${digits.slice(1, 3)}:${digits.slice(3)}`
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`
}

export default function VideoTimestampInput({ value, onChange, placeholder, className }) {
  const handleChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 6)
    onChange(formatTimestamp(digits))
  }

  const handleKeyDown = (event) => {
    if (event.key !== 'Backspace') return
    event.preventDefault()
    const digits = String(value || '').replace(/\D/g, '')
    onChange(formatTimestamp(digits.slice(0, -1)))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
    />
  )
}
