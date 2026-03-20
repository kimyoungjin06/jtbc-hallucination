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
    p1: { contribution:'A', competency:'A', collaboration:'A', crisis:'A', intuition:'B', ethics:'C', aiVerification:'B' },
    p2: { contribution:'B', competency:'C', collaboration:'A', crisis:'C', intuition:'A', ethics:'C', aiVerification:'C' },
    p3: { contribution:'B', competency:'B', collaboration:'A', crisis:'C', intuition:'B', ethics:'B', aiVerification:'D' },
    p4: { contribution:'B', competency:'A', collaboration:'C', crisis:'B', intuition:'B', ethics:'A', aiVerification:'S' },
    p5: { contribution:'A', competency:'S', collaboration:'B', crisis:'B', intuition:'A', ethics:'S', aiVerification:'S' },
    p6: { contribution:'C', competency:'C', collaboration:'B', crisis:'D', intuition:'C', ethics:'B', aiVerification:'D' },
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
  FINAL_FIRED:    ['p2', 'p3', 'p5'],  // 황제성(대리), 츠키(주임), 곽재식(과장)
  FINAL_RETAINED: ['p4', 'p1', 'p6'],  // 허성범(인턴), 하석진(차장), 가온(사원)

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
    p4: {
      evaluation: '경험은 이 자리에서 가장 얕았습니다. 하지만 탈출 게임에서 수학적 해결 능력은 독보적이었고, 창의적 발상으로 문제 풀이에 큰 기여를 했습니다. 게임 제작에서는 \'우선 돌아가면 건들지 말아라\'라는 코딩의 법칙을 언급하며 AI 도구에 대한 이해도를 보여줬고, 다른 컴퓨터에서도 작동하는지 확인하는 치밀함까지 갖췄습니다.',
      oneliner: '눈이 좋은 건 알았습니다. 이번엔 손도 따라왔습니다. 다만 다음에도 이 속도가 유지될지는 지켜보겠습니다.',
      conclusion: '허성범 인턴은 고용 유지 대상자입니다.',
      order: '본래의 업무로 복귀하십시오.',
    },
    p1: {
      evaluation: '탈출 게임에서 일본인인 츠키도 못 푼 일본어 퀴즈를 풀었습니다. 백색 소음에서 직급에 걸맞지 않은 노력을 보여줬고, 토론 배틀에서 야구 데이터 분석이라는 날카로운 비유를 꺼냈습니다. 매 실무에 골고루 참여한 유일한 인물입니다. 다만 게임 제작에서 몰두하느라 주변과의 상호작용이 결여되었다는 기록이 남습니다.',
      oneliner: '이번엔 살아남았습니다. 혼자 몰두하는 집중력은 무기지만, 옆을 잊는 순간 그건 고립입니다.',
      conclusion: '하석진 차장은 고용 유지 대상자입니다.',
      order: '본래의 업무로 복귀하십시오.',
    },
    p6: {
      evaluation: '탈출 게임에서 역사 순서 문제의 핵심을 집었고, 백색 소음에서 음악 맞추기에 독보적이었습니다. 사전평가에서는 최하위였지만, 비즈니스 피칭에서 가격 룰의 한계를 뛰어넘는 창의적 광고 요소를 제시했고, 본인의 역량을 프레젠테이션에 녹여냈습니다.',
      oneliner: '가능성만 보였던 사람이 결과를 보여줬습니다. 다만 이번이 시작이지 증명이 끝난 건 아닙니다.',
      conclusion: '가온 사원은 고용 유지 대상자입니다.',
      order: '본래의 업무로 복귀하십시오.',
    },
    p2: {
      evaluation: '무궁화 꽃이 피었습니다에서 상황 정리와 전파를 잘 했고, 비즈니스 피칭에서 유쾌함 속에 핵심을 놓치지 않는 센스를 보여줬습니다. 하지만 게임 제작에서 AI에게 \'너가 해\'라는 도발적 발언을 했습니다. 도구를 다루는 자리에서 도구에게 떠넘기는 태도는 이 조직이 원하는 것이 아닙니다.',
      oneliner: '분위기를 살리는 건 인정합니다. 하지만 이 자리에서는 분위기가 아니라 결과를 살려야 합니다.',
      conclusion: '황제성 대리는 해고 대상자입니다.',
      order: '오빗 컨설팅을 떠나주십시오.',
    },
    p3: {
      evaluation: '탈출 게임에서 관찰력이 뛰어났고, 백색 소음에서 음악 맞추기에 독보적이었습니다. 무궁화 꽃이 피었습니다에서 동료를 돕는 희생정신을 보여줬고, 게임 제작에서 불합리한 조건을 독수리 타법으로 극복하는 적응력까지 있었습니다. 협동심과 본인이 잘하는 영역은 분명했습니다. 하지만 가장 중요한 현장 업무 능력 — AI를 검증하고, 결과를 만들어내는 힘은 보이지 못했습니다.',
      oneliner: '좋은 사람이었습니다. 하지만 이 자리는 좋은 사람이 아니라 해내는 사람을 남기는 자리입니다.',
      conclusion: '츠키 주임은 해고 대상자입니다.',
      order: '오빗 컨설팅을 떠나주십시오.',
    },
    p5: {
      evaluation: '무궁화 꽃이 피었습니다에서 룰 확인을 반복하며 AI 검증력을 보여줬고, 게임 제작에서 제한시간을 다 쓰지 않고 5분 만에 완성하는 빠른 결정력이 있었습니다. 사전평가에서는 1위였습니다. 하지만 현장에서의 존재감은 기대에 미치지 못했고, 팀원들의 사기를 저하시키는 행동이 관측되었습니다. 혼자 빠르게 끝내는 것은 능력이지만, 그 과정에서 팀이 위축된다면 조직에는 독이 됩니다.',
      oneliner: '능력이 있다는 건 압니다. 하지만 혼자만의 능력은 이 조직에서 충분하지 않았습니다.',
      conclusion: '곽재식 과장은 해고 대상자입니다.',
      order: '오빗 컨설팅을 떠나주십시오.',
    },
  },

  // ═══════════════════════════════════
  // team_agent_vis 서버 주소
  // ═══════════════════════════════════
  TEAM_VIZ_URL: 'http://localhost:3000',

};
