// FINA 포인트 계산 공식: 1000 * (WR / 기록)^3
// 세계기록 (초 단위)
const WORLD_RECORDS = {
  '자유형 400m':  220.07,  // 3:40.07 Paul Biedermann
  '자유형 800m':  452.12,  // 7:32.12 Zhang Lin
  '자유형 1500m': 871.02,  // 14:31.02 Sun Yang
  '개인혼영 400m': 254.13, // 4:14.13 Michael Phelps
}

export function timeToSeconds(timeStr) {
  // "3:49.49" 또는 "15:13.36" 형식
  const parts = timeStr.split(':')
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return parseFloat(timeStr)
}

export function calcFinaPoints(event, timeStr) {
  const wr = WORLD_RECORDS[event]
  if (!wr || !timeStr) return null
  const sec = timeToSeconds(timeStr)
  if (!sec) return null
  return Math.round(1000 * Math.pow(wr / sec, 3))
}
