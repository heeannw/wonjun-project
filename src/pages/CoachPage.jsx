import { ClipboardCheck, AlertTriangle, Waves, FileText, MessageSquare } from 'lucide-react'

const coachSections = [
  {
    title: '선수 상태 요약',
    icon: ClipboardCheck,
    text: '최근 훈련량, 피로, 컨디션, 기록 변화를 한 화면에서 확인하는 영역입니다.',
  },
  {
    title: '위험 신호',
    icon: AlertTriangle,
    text: '피로 누적, 기록 저하, 수면 부족, 시합 후 회복 부족을 빠르게 확인합니다.',
  },
  {
    title: '시합 분석',
    icon: Waves,
    text: 'PB 대비 손실 구간과 보완 훈련 제안을 정리합니다.',
  },
  {
    title: '월간 코치 리포트',
    icon: FileText,
    text: '이번 달 성장, 문제점, 다음 달 훈련 방향을 코치 관점으로 요약합니다.',
  },
  {
    title: '코치 메모',
    icon: MessageSquare,
    text: '코치가 직접 피드백과 다음 훈련 지시를 남기는 영역입니다.',
  },
]

export default function CoachPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">코치 보드</h1>
        <p className="text-slate-400 text-sm mt-0.5">연결된 선수의 상태를 코치 관점으로 확인합니다</p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
        <p className="text-sm text-blue-300 leading-relaxed">
          현재는 코치 로그인 화면과 코치 보드 진입 구조를 만든 단계입니다.
          다음 단계에서 Supabase 역할(role), 코치-선수 연결, 코치 메모 저장을 붙이면 실제 코치 계정으로 원준 데이터를 조회할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {coachSections.map(({ title, icon: Icon, text }) => (
          <div key={title} className="bg-[#1a1d27] rounded-xl border border-slate-700/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon size={16} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
