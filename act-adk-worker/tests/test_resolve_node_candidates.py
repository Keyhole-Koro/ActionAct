import asyncio

from app.domain.models import CandidateGraphNode, CandidateResolutionInput
from app.usecase.resolve_node_candidates import ResolveNodeCandidatesUsecase
from app.adapter.mock_llm import MockLLM


async def _run_usecase():
    uc = ResolveNodeCandidatesUsecase(llm=MockLLM())
    return await uc.execute(
        CandidateResolutionInput(
            trace_id="t1",
            uid="u1",
            topic_id="topic-1",
            workspace_id="ws-1",
            user_message="このノード",
            nodes=[
                CandidateGraphNode(node_id="node-1", title="AWS"),
                CandidateGraphNode(node_id="node-2", title="Windows"),
            ],
        )
    )


def test_resolve_node_candidates_usecase_returns_candidates():
    result = asyncio.run(_run_usecase())
    assert len(result.candidates) == 2
    assert result.candidates[0].node_id == "node-1"
