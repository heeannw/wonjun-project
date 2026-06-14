// World Aquatics Points 계산 공식: 1000 * (BaseTime / 기록)^3
// 남자 롱코스(50m) 기준 기록. 최신 확인일: 2026-06-14.
// 현재 앱은 원준 선수 기록용이라 남자 LCM 기준만 사용한다.
const WORLD_RECORDS = {
  // 자유형
  '자유형 50m': 20.91,      // Cesar Cielo, 2009
  '자유형 100m': 46.40,     // Pan Zhanle, 2024
  '자유형 200m': 102.00,    // Paul Biedermann, 2009 (1:42.00)
  '자유형 400m': 219.96,    // Lukas Maertens, 2025 (3:39.96)
  '자유형 800m': 452.12,    // Zhang Lin, 2009 (7:32.12)
  '자유형 1500m': 870.67,   // Bobby Finke, 2024 (14:30.67)

  // 배영
  '배영 50m': 23.55,        // Kliment Kolesnikov, 2023
  '배영 100m': 51.60,       // Thomas Ceccon, 2022
  '배영 200m': 111.92,      // Aaron Peirsol, 2009 (1:51.92)

  // 평영
  '평영 50m': 25.95,        // Adam Peaty, 2017
  '평영 100m': 56.88,       // Adam Peaty, 2019
  '평영 200m': 125.48,      // Qin Haiyang, 2023 (2:05.48)

  // 접영
  '접영 50m': 22.27,        // Andriy Govorov, 2018
  '접영 100m': 49.45,       // Caeleb Dressel, 2019
  '접영 200m': 110.34,      // Kristof Milak, 2019 (1:50.34)

  // 개인혼영
  '개인혼영 200m': 112.69,  // Leon Marchand, 2025 (1:52.69)
  '개인혼영 400m': 242.50,  // Leon Marchand, 2023 (4:02.50)
}

export function timeToSeconds(timeStr) {
  if (!timeStr) return 0
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
