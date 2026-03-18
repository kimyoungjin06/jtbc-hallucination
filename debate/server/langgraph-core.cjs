const { StateGraph } = require("../node_modules/@langchain/langgraph/dist/graph/state.cjs");
const { START, END } = require("../node_modules/@langchain/langgraph/dist/constants.cjs");

function createDecisionGraph({
  aggregateSignals,
  recommendAction,
  normalizeAction,
  composeCopy,
  getDefaultSignals
}) {
  return new StateGraph({
    channels: {
      requestedAction: {
        value: (_left, right) => right,
        default: () => null
      },
      events: {
        value: (_left, right) => (Array.isArray(right) ? right : []),
        default: () => []
      },
      signals: {
        value: (_left, right) => right,
        default: () => getDefaultSignals()
      },
      recommendedAction: {
        value: (_left, right) => right,
        default: () => "hold"
      },
      decision: {
        value: (_left, right) => right,
        default: () => "hold"
      },
      operatorSummary: {
        value: (_left, right) => right,
        default: () => ""
      },
      publicSummary: {
        value: (_left, right) => right,
        default: () => ""
      }
    }
  })
    .addNode("aggregate_signals", (state) => ({
      signals: aggregateSignals(state.events)
    }))
    .addNode("resolve_action", (state) => {
      const recommendedAction = recommendAction(state.signals);
      return {
        recommendedAction,
        decision: normalizeAction(state.requestedAction, recommendedAction)
      };
    })
    .addNode("compose_copy", (state) => {
      const copy = composeCopy(
        state.decision,
        state.signals,
        state.recommendedAction
      );

      return {
        operatorSummary: copy.operator,
        publicSummary: copy.public
      };
    })
    .addEdge(START, "aggregate_signals")
    .addEdge("aggregate_signals", "resolve_action")
    .addEdge("resolve_action", "compose_copy")
    .addEdge("compose_copy", END)
    .compile();
}

module.exports = {
  createDecisionGraph
};
