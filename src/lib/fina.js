// World Aquatics 포인트 계산 공식: 1000 * (WR / 기록)^3
// 세계기록 (초 단위, 50m 풀 기준)
const WORLD_RECORDS = {
  // 자유형
  '자유형 50m':    20.91,  // César Cielo 2009
  '자유형 100m':   46.80,  // Pan Zhanle 2024
  '자유형 200m':  102.00,  // Paul Biedermann 2009 (1:42.00)
  '자유형 400m':  220.07,  // Paul Biedermann 2009 (3:40.07)
  '자유형 800m':  452.12,  // Zhang Lin 2009 (7:32.12)
  '자유형 1500m': 871.02,  // Sun Yang 2012 (14:31.02)
  // 배영
  '배영 50m':      24.00,  // Kliment Kolesnikov 2021
  '배영 100m':     51.60,  // Thomas Ceccon 2022
  '배영 200m':    111.92,  // Aaron Peirsol 2009 (1:51.92)
  // 평영
  '평영 50m':      25.95,  // Adam Peaty 2017
  '평영 100m':     56.88,  // Adam Peaty 2019
  '평영 200m':    125.95,  // Zac Stubblety-Cook 2021 (2:05.95)
  // 접영
  '접영 50m':      22.27,  // Andriy Govorov 2018
  '접영 100m':     49.45,  // Caeleb Dressel 2019
  '접영 200m':    110.34,  // Kristóf Milák 2019 (1:50.34)
  // 개인혼영
  '개인혼영 200m': 114.00, // Ryan Lochte 2011 (1:54.00)
  '개인혼영 400m': 243.84, // Michael Phelps 2008 (4:03.84)
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
