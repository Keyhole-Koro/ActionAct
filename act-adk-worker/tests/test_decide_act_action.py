import asyncio

from app.domain.models import ActDecisionInput, CandidateGraphNode, LLMChunk
from app.usecase.decide_act_action import DecideActActionUsecase


class FakeLLM:
    async def generate(self, _bundle, _config):
        yield LLMChunk(
            text='{"action":"choose_candidate","message":"どのノードですか？","suggested_action":"select_node","context_node_ids":[],"candidates":[{"node_id":"node-1","label":"AWS","reason":"AWSについてのノードです"},{"node_id":"node-2","label":"Windows","reason":"Windowsについてのノードです"}]}'
        )
        yield LLMChunk(is_done=True)


async def _run_usecase():
    uc = DecideActActionUsecase(llm=FakeLLM())
    return await uc.execute(
        ActDecisionInput(
            trace_id="t1",
            uid="u1",
            topic_id="topic-1",
            workspace_id="ws-1",
            user_message="このノードの違いは？",
            active_node_id="node-1",
            selected_node_ids=[],
            available_tools=["get_visible_graph", "get_selected_nodes"],
            nodes=[
                CandidateGraphNode(node_id="node-1", title="AWS"),
                CandidateGraphNode(node_id="node-2", title="Windows"),
            ],
        )
    )


def test_decide_act_action_returns_candidate_selection():
    result = asyncio.run(_run_usecase())
    assert result.action == "choose_candidate"
    assert len(result.candidates) == 2
    assert result.candidates[0].node_id == "node-1"
