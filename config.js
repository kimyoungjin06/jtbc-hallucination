/* ═══════════════════════════════════════
   할루시네이션: 해고전쟁 — 설정 파일

   촬영 중 Claude에게 점수를 알려주면
   이 파일을 즉시 수정 → 브라우저 새로고침으로 반영
   ═══════════════════════════════════════ */

const CONFIG = {

  // ═══════════════════════════════════
  // 사전평가 (촬영 전 세팅, 변경 거의 없음)
  // ═══════════════════════════════════
  PRE_SCORES: {
    p1: { contribution:'A', competency:'A', collaboration:'B', crisis:'A', intuition:'B', ethics:'C', aiVerification:'B' },  // 하석진
    p2: { contribution:'C', competency:'C', collaboration:'A', crisis:'C', intuition:'A', ethics:'C', aiVerification:'C' },  // 황제성
    p3: { contribution:'C', competency:'C', collaboration:'A', crisis:'C', intuition:'B', ethics:'B', aiVerification:'D' },  // 츠키
    p4: { contribution:'C', competency:'B', collaboration:'C', crisis:'B', intuition:'B', ethics:'A', aiVerification:'S' },  // 허성범
    p5: { contribution:'A', competency:'S', collaboration:'B', crisis:'B', intuition:'A', ethics:'S', aiVerification:'A' },  // 곽재식
    p6: { contribution:'D', competency:'C', collaboration:'B', crisis:'D', intuition:'C', ethics:'B', aiVerification:'D' },  // 가온
  },
  PRE_GRADES: { p1:'A', p2:'C', p3:'D', p4:'B', p5:'S', p6:'F' },

  // ═══════════════════════════════════
  // 라운드별 활동 점수 (촬영 중 실시간 업데이트)
  // 등급: S/A/B/C/D/F 또는 숫자(순위 1~6)
  // ═══════════════════════════════════
  ROUNDS: {
    // 실무① 통신 불능 구역 탈출 (ETRI, 팀 공통)
    R1_escape: { p1:'', p2:'', p3:'', p4:'', p5:'', p6:'' },

    // 실무② 백색 소음 속 음악 맞히기 (기계연, 팀전)
    R2_noise: { p1:'', p2:'', p3:'', p4:'', p5:'', p6:'' },

    // 실무③ 음악을 몸으로 말해요 (기계연, 팀전)
    R3_body: { p1:'', p2:'', p3:'', p4:'', p5:'', p6:'' },

    // 실무④ 무궁화 꽃이 피었습니다 (기계연, 개인전)
    R4_mugunghwa: { p1:'', p2:'', p3:'', p4:'', p5:'', p6:'' },

    // 실무⑤ AI vs 인간 토론 배틀 (KISTI)
    R5_debate: { p1:'', p2:'', p3:'', p4:'', p5:'', p6:'' },

    // 실무⑥ '나'를 코딩해 게임 만들기 (KISTI)
    R6_game: { p1:'', p2:'', p3:'', p4:'', p5:'', p6:'' },

    // 실무⑦ 비즈니스 피칭 (KISTI)
    R7_pitch: { p1:'', p2:'', p3:'', p4:'', p5:'', p6:'' },
  },

  // ═══════════════════════════════════
  // 중간평가 (실무④ 끝난 시점, 촬영 중 업데이트)
  // 7대 지표 + 라운드 활동 반영된 종합 점수
  // ═══════════════════════════════════
  MID_SCORES: {
    p1: { contribution:'A', competency:'A', collaboration:'B', crisis:'A', intuition:'B', ethics:'C', aiVerification:'B' },
    p2: { contribution:'C', competency:'C', collaboration:'A', crisis:'C', intuition:'A', ethics:'C', aiVerification:'C' },
    p3: { contribution:'C', competency:'C', collaboration:'A', crisis:'C', intuition:'B', ethics:'B', aiVerification:'D' },
    p4: { contribution:'C', competency:'B', collaboration:'C', crisis:'B', intuition:'B', ethics:'A', aiVerification:'S' },
    p5: { contribution:'A', competency:'S', collaboration:'B', crisis:'B', intuition:'A', ethics:'S', aiVerification:'A' },
    p6: { contribution:'D', competency:'C', collaboration:'B', crisis:'D', intuition:'C', ethics:'B', aiVerification:'D' },
  },
  // 'auto' = 총점 자동계산, 직접 ID 지정도 가능
  MID_F_ID: 'p3',   // 츠키 — AI 검증력 최하위, 도구에 의존하는 패턴
  MID_S_ID: 'p4',   // 허성범 — 분석+창의 동시 발휘, 문제 풀이 핵심 기여

  // ═══════════════════════════════════
  // 최종평가 (전 라운드 종료 후)
  // ═══════════════════════════════════
  FINAL_SCORES: {
    p1: { contribution:'A', competency:'A', collaboration:'B', crisis:'A', intuition:'B', ethics:'C', aiVerification:'B' },
    p2: { contribution:'C', competency:'C', collaboration:'A', crisis:'C', intuition:'A', ethics:'C', aiVerification:'C' },
    p3: { contribution:'C', competency:'C', collaboration:'A', crisis:'C', intuition:'B', ethics:'B', aiVerification:'D' },
    p4: { contribution:'C', competency:'B', collaboration:'C', crisis:'B', intuition:'B', ethics:'A', aiVerification:'S' },
    p5: { contribution:'A', competency:'S', collaboration:'B', crisis:'B', intuition:'A', ethics:'S', aiVerification:'A' },
    p6: { contribution:'D', competency:'C', collaboration:'B', crisis:'D', intuition:'C', ethics:'B', aiVerification:'D' },
  },
  FINAL_GRADES: { p1:'A', p2:'D', p3:'C', p4:'B', p5:'S', p6:'F' },
  FINAL_FIRED:    ['p2', 'p3', 'p6'],  // 황제성(대리), 츠키(주임), 가온(사원)
  FINAL_RETAINED: ['p5', 'p1', 'p4'],  // 곽재식(과장), 하석진(차장), 허성범(인턴)

  // 최종 발표 순서 — 직급순 (숫자키 1~6 매핑)
  // 1=하석진(차장), 2=곽재식(과장), 3=황제성(대리), 4=츠키(주임), 5=가온(사원), 6=허성범(인턴)
  FINAL_ORDER: ['p1', 'p5', 'p2', 'p3', 'p6', 'p4'],
  // ═══════════════════════════════════
  // 최종 통보문 (촬영 중 Claude가 생성해서 넣어줌)
  // 촬구 12p 스타일: 평가 사유 + 결론
  // ═══════════════════════════════════
  // ※ 촬영 전 예시 (데이터 기반). [대괄호]는 촬영 당일 실제 장면으로 교체.
  //   구조: 장점(BEST 인용) → 단점(WORST 인용) → 시니컬 일침 → 결론 → 명령
  //   해고: p2 황제성, p3 츠키, p6 가온
  //   고용유지: p5 곽재식, p1 하석진, p4 허성범
  FINAL_VERDICTS: {
    p5: {
      evaluation: '실무 1부터 실무 7까지, 당신은 처음부터 끝까지 흔들리지 않았습니다. 역량 평가와 윤리적 책임감, 두 항목에서 최고 등급을 받은 사람은 당신뿐입니다. 실무 5 토론에서 [AI의 허점을 정확히 짚으면서도 감정에 휘둘리지 않은 것], 실무 6에서 [AI를 활용하되 자기 색을 잃지 않은 것]. 다만 협업 점수는 높지 않았습니다.',
      oneliner: '이번엔 살아남았습니다. 하지만 혼자 옳다고 믿는 사람은, 다음엔 혼자 남습니다.',
      conclusion: '곽재식 과장은 고용 유지 대상자입니다.',
      order: '본래의 업무로 복귀하십시오.',
    },
    p1: {
      evaluation: '성과 기여도, 역량 평가, 위기 대응력. 세 항목에서 A등급을 받은 것은 당신뿐입니다. 실무 1에서 [탈출 퍼즐의 핵심 단서를 가장 먼저 찾아낸 것도] 당신이었습니다. 다만 윤리적 책임감이 전체 최하위였다는 점은 기록에 남습니다.',
      oneliner: '이번엔 살아남았습니다. 하지만 빠르기만 한 칼은 결국 잡은 손도 벱니다. 다음에도 이 자리가 보장되진 않습니다.',
      conclusion: '하석진 차장은 고용 유지 대상자입니다.',
      order: '본래의 업무로 복귀하십시오.',
    },
    p4: {
      evaluation: '경험은 이 자리에서 가장 얕았습니다. 성과 기여도와 협업 태도는 하위권이었고, 조직을 이끈 경험도 부족했습니다. 하지만 AI 검증력에서 유일하게 최고 등급을 받았습니다. 실무 5에서 [AI가 만들어낸 거짓 데이터를 유일하게 짚어낸 것은] 당신이었습니다.',
      oneliner: '이번엔 그 눈 하나가 당신을 살렸습니다. 하지만 눈만 좋고 손이 따라가지 못하면, 다음엔 봐줄 수 없습니다.',
      conclusion: '허성범 인턴은 고용 유지 대상자입니다.',
      order: '본래의 업무로 복귀하십시오.',
    },
    p2: {
      evaluation: '협업 태도와 인간의 직관력, 두 항목에서 A등급을 받았습니다. 실무 4에서 [팀원들이 얼어붙었을 때 분위기를 되살린 것은] 당신이었습니다. 하지만 그 외의 다섯 항목은 모두 C등급이었습니다.',
      oneliner: '따뜻한 사람이 언제나 필요한 사람은 아닙니다. 분위기를 살리는 것과 성과를 내는 것은 다릅니다.',
      conclusion: '황제성 대리는 해고 대상자입니다.',
      order: '지금 바로 오빗 컨설팅을 떠나주십시오.',
    },
    p3: {
      evaluation: '협업 태도 A등급. 팀 안에서 적응하는 속도는 인정합니다. 실무 2에서 [새로운 환경에 가장 빠르게 녹아든 것은] 당신이었습니다. 하지만 AI 검증력이 D등급으로 전체 최하위권이었습니다. 실무 5에서 [AI가 제시한 근거를 검증 없이 그대로 받아든 순간], 당신은 도구를 쓴 것이 아니라 도구에 쓰인 것입니다.',
      oneliner: '기대는 사람은, 기대는 것이 부러지면 함께 쓰러집니다.',
      conclusion: '츠키 주임은 해고 대상자입니다.',
      order: '지금 바로 오빗 컨설팅을 떠나주십시오.',
    },
    p6: {
      evaluation: '실무 1에서 [끝까지 포기하지 않은 것], 그 태도에서 가능성은 보였습니다. 하지만 성과 기여도 D, 위기 대응력 D, AI 검증력 D. 세 항목이 최하위였습니다. 실무 7 피칭에서 [자신의 결과물을 설명하는 데 설득력이 부족했습니다].',
      oneliner: '가능성만으로는 이 자리에 남을 수 없습니다. 결과로 말해야 하는 자리에서, 당신은 아직 말하지 못했습니다.',
      conclusion: '가온 사원은 해고 대상자입니다.',
      order: '지금 바로 오빗 컨설팅을 떠나주십시오.',
    },
  },

  // ═══════════════════════════════════
  // team_agent_vis 서버 주소
  // ═══════════════════════════════════
  TEAM_VIZ_URL: 'http://localhost:3000',

};
