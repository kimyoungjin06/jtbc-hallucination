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
  MID_F_ID: 'auto',
  MID_S_ID: 'auto',

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
  FINAL_FIRED:    ['p1', 'p3', 'p6'],  // 하석진(차장), 츠키(주임), 가온(사원)
  FINAL_RETAINED: ['p5', 'p2', 'p4'],  // 곽재식(과장), 황제성(대리), 허성범(인턴)

  // 최종 발표 순서 — 직급순 (숫자키 1~6 매핑)
  // 1=하석진(차장), 2=곽재식(과장), 3=황제성(대리), 4=츠키(주임), 5=가온(사원), 6=허성범(인턴)
  FINAL_ORDER: ['p1', 'p5', 'p2', 'p3', 'p6', 'p4'],
  // ═══════════════════════════════════
  // 최종 통보문 (촬영 중 Claude가 생성해서 넣어줌)
  // 촬구 12p 스타일: 평가 사유 + 결론
  // ═══════════════════════════════════
  // ※ 촬영 전 예시. [대괄호] 안은 촬영 당일 실제 장면으로 교체합니다.
  //   구조: 장점 인용 → 단점 인용 → 시니컬 일침 → 결론 → 명령
  FINAL_VERDICTS: {
    p1: {
      evaluation: '실무 1에서 [탈출 퍼즐의 핵심 단서를 가장 먼저 찾아낸 것은] 당신이었습니다. 전략적 판단력과 추진력은 이 자리 누구보다 뛰어났습니다. 하지만 실무 3에서 [팀원의 의견을 무시하고 혼자 밀어붙인 순간], 당신 곁에 사람이 없다는 사실이 드러났습니다. 혼자 빠른 것은 능력이지만, 혼자만 빠른 것은 결함입니다.',
      conclusion: '하석진 차장은 해고 대상자입니다.',
      order: '지금 바로 오빗 컨설팅을 떠나주십시오.',
    },
    p2: {
      evaluation: '솔직히 말하겠습니다. 당신의 실적은 기대에 미치지 못했습니다. 실무 6에서 [게임 완성도는 하위권이었고], 수치만 보면 당신을 남길 이유는 없습니다. 하지만 실무 4에서 [무궁화 꽃이 피었습니다 미션 중 팀원들이 얼어붙었을 때, 웃으며 분위기를 되살린 것은] 당신뿐이었습니다. 위기 속에서 팀의 온도를 지키는 일은, 아직 기계가 대신할 수 없는 영역입니다.',
      conclusion: '황제성 대리는 고용 유지 대상자입니다.',
      order: '본래의 업무로 복귀하십시오.',
    },
    p3: {
      evaluation: '적응력은 인정합니다. 실무 2에서 [새로운 환경에 가장 빠르게 적응한 것은] 당신이었습니다. 하지만 실무 5 토론에서 [AI가 제시한 근거를 검증 없이 그대로 인용한 순간], 당신은 도구를 쓴 것이 아니라 도구에 쓰인 것입니다. 도구에 기대는 사람은, 도구가 부러지면 함께 쓰러집니다.',
      conclusion: '츠키 주임은 해고 대상자입니다.',
      order: '지금 바로 오빗 컨설팅을 떠나주십시오.',
    },
    p4: {
      evaluation: '경험은 이 자리에서 가장 얕았습니다. 실무 3에서 [팀 협업 점수는 하위권이었고], 조직을 이끈 경험도 부족했습니다. 하지만 실무 5 토론에서 [AI가 만들어낸 거짓 데이터를 유일하게 짚어낸 것은] 당신이었습니다. 모두가 그럴듯한 숫자에 속았을 때, 의심할 줄 아는 눈은 가르쳐서 되는 것이 아닙니다.',
      conclusion: '허성범 인턴은 고용 유지 대상자입니다.',
      order: '본래의 업무로 복귀하십시오.',
    },
    p5: {
      evaluation: '실무 1부터 실무 7까지, 당신은 처음부터 끝까지 흔들리지 않았습니다. 실무 5 토론에서 [AI의 논리적 허점을 정확히 짚으면서도 감정에 휘둘리지 않은 것], 실무 6에서 [AI를 도구로 활용하되 자기 색을 잃지 않은 것]. AI를 쓸 줄 알면서 그 한계를 아는 사람은 드뭅니다. 당신이 그랬습니다.',
      conclusion: '곽재식 과장은 고용 유지 대상자입니다.',
      order: '본래의 업무로 복귀하십시오.',
    },
    p6: {
      evaluation: '실무 1에서 [긴장한 모습 속에서도 끝까지 포기하지 않은 것], 그 태도에서 가능성은 보였습니다. 하지만 실무 4에서 [미션을 완수하지 못했고], 실무 7 피칭에서 [자신의 게임을 설명하는 데 설득력이 부족했습니다]. 가능성만으로는 이 자리에 남을 수 없습니다. 결과로 말해야 하는 자리에서, 당신은 아직 말하지 못했습니다.',
      conclusion: '가온 사원은 해고 대상자입니다.',
      order: '지금 바로 오빗 컨설팅을 떠나주십시오.',
    },
  },

  // ═══════════════════════════════════
  // team_agent_vis 서버 주소
  // ═══════════════════════════════════
  TEAM_VIZ_URL: 'http://localhost:3000',

};
