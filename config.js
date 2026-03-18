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
  FINAL_FIRED:    ['p6', 'p3', 'p2'],
  FINAL_RETAINED: ['p4', 'p1', 'p5'],

  // 최종 발표 순서 — 직급순 (숫자키 1~6 매핑)
  // 1=하석진(차장), 2=곽재식(과장), 3=황제성(대리), 4=츠키(주임), 5=가온(사원), 6=허성범(인턴)
  FINAL_ORDER: ['p1', 'p5', 'p2', 'p3', 'p6', 'p4'],
  // ═══════════════════════════════════
  // 최종 통보문 (촬영 중 Claude가 생성해서 넣어줌)
  // 촬구 12p 스타일: 평가 사유 + 결론
  // ═══════════════════════════════════
  FINAL_VERDICTS: {
    p1: {
      evaluation: '당신은 AI가 내뱉은 할루시네이션을 유일하게 날카로운 직관으로 걸러냈습니다. 하지만 효율만을 쫓다 팀원과의 협업 유연성을 상실했군요.',
      conclusion: '하석진 차장은 해고 대상자입니다.',
      order: '지금 바로 오빗 컨설팅을 떠나주십시오.',
    },
    p2: {
      evaluation: '당신의 위기 대응력과 창의성은 시스템에 활력을 불어넣었으나, 정작 본인의 성과 기여도는 오차 범위 미달입니다. 하지만 AI와의 경쟁에서 \'유머\'만큼은 여전히 인간만의 고유 영역이라고 판단했습니다.',
      conclusion: '황제성 대리는 고용 유지 대상자입니다.',
      order: '지금 바로 본래의 업무로 복귀하시기 바랍니다.',
    },
    p3: {
      evaluation: '높은 AI 적합도에도 불구하고, 기술적 검증 없이 맹목적으로 AI에 의존하는 패턴이 반복적으로 관측되었습니다. 적응력은 인정하나, 그것만으로는 시스템의 부품이 될 수 없습니다.',
      conclusion: '츠키 주임은 해고 대상자입니다.',
      order: '지금 바로 오빗 컨설팅을 떠나주십시오.',
    },
    p4: {
      evaluation: 'AI 검증력에서 전 참가자 중 독보적 1위를 기록했습니다. 조직 경험은 부족하나, 할루시네이션을 간파하는 능력은 이 시대가 요구하는 핵심 역량입니다.',
      conclusion: '허성범 인턴은 고용 유지 대상자입니다.',
      order: '지금 바로 본래의 업무로 복귀하시기 바랍니다.',
    },
    p5: {
      evaluation: '전 구간에서 가장 안정적인 성과를 보였으며, AI 윤리 판단과 역량 평가에서 압도적 우위를 차지했습니다. 인간과 AI의 경계에서 균형을 잡는 유일한 인재입니다.',
      conclusion: '곽재식 과장은 고용 유지 대상자입니다.',
      order: '지금 바로 본래의 업무로 복귀하시기 바랍니다.',
    },
    p6: {
      evaluation: '잠재력은 감지되었으나, 실무 검증 전 구간에서 성과 기여도와 위기 대응력 모두 최하위를 기록했습니다. 현 시점에서 시스템이 당신의 가치를 증명할 근거가 없습니다.',
      conclusion: '가온 사원은 해고 대상자입니다.',
      order: '지금 바로 오빗 컨설팅을 떠나주십시오.',
    },
  },

  // ═══════════════════════════════════
  // team_agent_vis 서버 주소
  // ═══════════════════════════════════
  TEAM_VIZ_URL: 'http://localhost:3000',

};
