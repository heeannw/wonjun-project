function formatTime(digits) {
  if (digits.length === 0) return ''
  if (digits.length <= 2) return digits
  if (digits.length === 3) return digits[0] + '.' + digits.slice(1)
  if (digits.length === 4) return digits.slice(0, 2) + '.' + digits.slice(2)
  if (digits.length === 5) return digits[0] + ':' + digits.slice(1, 3) + '.' + digits.slice(3)
  return digits.slice(0, 2) + ':' + digits.slice(2, 4) + '.' + digits.slice(4, 6)
}

export default function TimeInput({ value, onChange, placeholder, className, onKeyDown, required }) {
  // onBeforeInput으로 숫자 외 모든 입력(한국어 IME 포함) 차단
  const handleBeforeInput = (e) => {
    if (e.data && !/^\d+$/.test(e.data)) {
      e.preventDefault()
    }
  }

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6)
    onChange(formatTime(raw))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const digits = (value || '').replace(/\D/g, '')
      onChange(formatTime(digits.slice(0, -1)))
      return
    }
    onKeyDown?.(e)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={handleChange}
      onBeforeInput={handleBeforeInput}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      required={required}
    />
  )
}
