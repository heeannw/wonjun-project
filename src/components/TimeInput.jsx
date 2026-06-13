/**
 * 수영 기록 자동 포맷 입력 컴포넌트
 * 숫자만 입력하면 오른쪽부터 채워지며 : 와 . 이 자동으로 삽입됨
 * 4자리: SS.XX (예: 24.73)
 * 5자리: M:SS.XX (예: 7:24.50)
 * 6자리: MM:SS.XX (예: 15:21.26)
 */

function formatTime(digits) {
  if (digits.length === 0) return ''
  if (digits.length <= 2) return digits
  if (digits.length === 3) return digits[0] + '.' + digits.slice(1)
  if (digits.length === 4) return digits.slice(0, 2) + '.' + digits.slice(2)
  if (digits.length === 5) return digits[0] + ':' + digits.slice(1, 3) + '.' + digits.slice(3)
  return digits.slice(0, 2) + ':' + digits.slice(2, 4) + '.' + digits.slice(4, 6)
}

export default function TimeInput({ value, onChange, placeholder, className, onKeyDown, required }) {
  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6)
    onChange(formatTime(raw))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const digits = value.replace(/\D/g, '')
      const newDigits = digits.slice(0, -1)
      onChange(formatTime(newDigits))
      return
    }
    onKeyDown?.(e)
  }

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      required={required}
      inputMode="numeric"
    />
  )
}
