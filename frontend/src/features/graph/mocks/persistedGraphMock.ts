import type { Edge, Node } from '@xyflow/react';

import type { PersistedNodeData } from '@/features/graph/types';

type PersistedGraphMock = {
    nodes: Node<PersistedNodeData>[];
    edges: Edge[];
};

type ClusterSeed = {
    id: string;
    label: string;
    summary: string;
    rootId: string;
    subclusters: Array<{
        id: string;
        label: string;
        summary: string;
        claims: Array<{
            id: string;
            label: string;
            summary: string;
        }>;
    }>;
};

const EXTRA_CLAIMS_PER_SUBCLUSTER = 2;
const DETAILS_PER_CLAIM = 3;
const LEAVES_PER_DETAIL = 2;

const CLUSTER_SEEDS: ClusterSeed[] = [
    {
        id: 'policy',
        label: 'Policy & Regulation',
        summary: 'Regulatory levers, market design, and political durability.',
        rootId: 'topic:climate-transition',
        subclusters: [
            {
                id: 'pricing',
                label: 'Carbon Pricing',
                summary: 'Signals that move capital and change cost curves.',
                claims: [
                    { id: 'auction-design', label: 'Auction design shapes investment pacing', summary: 'Permit auction cadence changes how developers hedge and bid.' },
                    { id: 'border-adjustment', label: 'Border adjustments alter export strategy', summary: 'Trade policy determines where heavy industry can justify low-carbon retrofits.' },
                    { id: 'household-rebate', label: 'Rebates drive public tolerance for price floors', summary: 'Revenue recycling affects political durability more than headline tax rates.' },
                ],
            },
            {
                id: 'permitting',
                label: 'Permitting Reform',
                summary: 'Approval speed controls when infrastructure reaches service.',
                claims: [
                    { id: 'queue-backlog', label: 'Queue backlogs hide viable projects', summary: 'Interconnection backlogs obscure which projects are commercially real.' },
                    { id: 'federal-state-split', label: 'Federal-state splits create approval drag', summary: 'Projects stall when land, transmission, and environmental review are fragmented.' },
                    { id: 'community-benefit', label: 'Benefit agreements reduce late-stage opposition', summary: 'Earlier local participation lowers cancellation risk.' },
                ],
            },
            {
                id: 'procurement',
                label: 'Public Procurement',
                summary: 'Demand guarantees shape supplier confidence.',
                claims: [
                    { id: 'green-steel-buying', label: 'Green steel procurement de-risks first plants', summary: 'Long-term offtake matters more than pilot grants.' },
                    { 
                        id: 'fleet-electrification', 
                        label: 'Public fleet conversion stabilizes charging demand', 
                        summary: 'Municipal and state fleets create predictable load profiles.',
                        detailHtml: `
                            <style>
                                .chart-container { font-family: sans-serif; padding: 10px; background: #f8fafc; border-radius: 8px; }
                                .chart-title { font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #1e293b; }
                                .bar-row { display: flex; align-items: center; margin-bottom: 8px; gap: 10px; }
                                .bar-label { width: 80px; font-size: 11px; color: #64748b; }
                                .bar-track { flex: 1; background: #e2e8f0; height: 12px; border-radius: 4px; overflow: hidden; }
                                .bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #60a5fa); border-radius: 4px; }
                                .bar-value { width: 30px; font-size: 11px; font-weight: bold; color: #334155; }
                            </style>
                            <div class="chart-container">
                                <div class="chart-title">Demand Stability Forecast</div>
                                <div class="bar-row">
                                    <div class="bar-label">Public</div>
                                    <div class="bar-track"><div class="bar-fill" style="width: 85%"></div></div>
                                    <div class="bar-value">85%</div>
                                </div>
                                <div class="bar-row">
                                    <div class="bar-label">Private</div>
                                    <div class="bar-track"><div class="bar-fill" style="width: 42%; background: #94a3b8;"></div></div>
                                    <div class="bar-value">42%</div>
                                </div>
                                <p style="font-size: 10px; color: #94a3b8; margin-top: 10px;">* Predicted utilization consistency over 24h cycle</p>
                            </div>
                        `
                    },
                    { id: 'retrofit-standards', label: 'Retrofit standards create installer pull', summary: 'Building codes create recurring demand instead of one-off incentives.' },
                ],
            },
        ],
    },
    {
        id: 'infrastructure',
        label: 'Infrastructure Systems',
        summary: 'Grid, storage, ports, and operational throughput.',
        rootId: 'topic:climate-transition',
        subclusters: [
            {
                id: 'grid',
                label: 'Transmission Grid',
                summary: 'Network bottlenecks define where low-carbon power can scale.',
                claims: [
                    { id: 'interconnection', label: 'Interconnection studies determine capital lockup', summary: 'Developers absorb financing costs while waiting for queue clarity.' },
                    { id: 'regional-lines', label: 'Regional lines unlock cheaper balancing', summary: 'Interregional transfer can lower total reserve needs.' },
                    { id: 'distribution-upgrades', label: 'Distribution upgrades lag behind electrification demand', summary: 'Local feeders often fail before generation becomes scarce.' },
                ],
            },
            {
                id: 'storage',
                label: 'Storage & Flexibility',
                summary: 'Flexible assets shift when renewables can clear the market.',
                claims: [
                    { id: 'duration-stack', label: 'Duration mix matters more than battery count', summary: 'Four-hour systems solve a different problem than seasonal reserves.' },
                    { id: 'thermal-storage', label: 'Thermal storage is underused in buildings', summary: 'Heating and cooling loads can absorb volatility if controls are modernized.' },
                    { id: 'dispatch-software', label: 'Dispatch software is a hidden system constraint', summary: 'Operators often lack tooling to value flexibility correctly.' },
                ],
            },
            {
                id: 'ports',
                label: 'Ports & Logistics',
                summary: 'Import routes and heavy equipment logistics shape build speed.',
                claims: [
                    { id: 'component-routing', label: 'Component routing sets offshore project speed', summary: 'Port crane limits and customs handling change construction windows.' },
                    { id: 'hydrogen-terminals', label: 'Hydrogen terminals need synchronized downstream demand', summary: 'Terminal investment is stranded without nearby industrial loads.' },
                    { id: 'rail-capacity', label: 'Rail capacity becomes a clean-tech bottleneck', summary: 'Material movement constrains deployment more than module nameplate supply.' },
                ],
            },
        ],
    },
    {
        id: 'industry',
        label: 'Industrial Adoption',
        summary: 'How firms change equipment, processes, and capital plans.',
        rootId: 'topic:industrial-rebuild',
        subclusters: [
            {
                id: 'buildings',
                label: 'Buildings & Heat',
                summary: 'Retrofits depend on labor, financing, and occupant disruption.',
                claims: [
                    { id: 'installer-capacity', label: 'Installer capacity limits heat pump uptake', summary: 'Training and scheduling dominate over consumer awareness.' },
                    { id: 'multifamily', label: 'Multifamily retrofits need split-incentive fixes', summary: 'Landlord-tenant misalignment delays efficient equipment replacement.' },
                    { id: 'retrofit-finance', label: 'Retrofit finance bundles reduce hesitation', summary: 'Packaging audit, loan, and contractor services improves conversion.' },
                ],
            },
            {
                id: 'materials',
                label: 'Materials & Chemicals',
                summary: 'Commodity sectors need power, feedstocks, and offtake certainty.',
                claims: [
                    { id: 'green-steel-power', label: 'Green steel needs firm power and bankable demand', summary: 'Electrolyzers alone do not make a steel project financeable.' },
                    { id: 'cement-substitution', label: 'Cement substitution scales faster than kiln replacement', summary: 'Standards and procurement matter more than process novelty in the near term.' },
                    { id: 'ammonia-shipping', label: 'Ammonia depends on shipping corridor coordination', summary: 'Ports, buyers, and fuel standards must move together.' },
                ],
            },
            {
                id: 'mobility',
                label: 'Mobility Systems',
                summary: 'Fleets, charging, and modal shift create uneven demand.',
                claims: [
                    { id: 'depot-power', label: 'Depot power upgrades delay fleet electrification', summary: 'Vehicle procurement often outpaces site readiness.' },
                    { id: 'charger-maintenance', label: 'Maintenance quality affects charger utilization more than unit count', summary: 'Downtime erodes confidence in corridor buildout.' },
                    { id: 'freight-mix', label: 'Freight decarbonization is route-specific, not universal', summary: 'Battery, hydrogen, and rail each fit different corridors.' },
                ],
            },
        ],
    },
    {
        id: 'finance',
        label: 'Capital & Risk',
        summary: 'Financing structure changes whether projects survive first-of-a-kind risk.',
        rootId: 'topic:industrial-rebuild',
        subclusters: [
            {
                id: 'insurance',
                label: 'Insurance & Underwriting',
                summary: 'Coverage availability can determine whether projects close.',
                claims: [
                    { id: 'performance-warranties', label: 'Performance warranties substitute for missing actuarial history', summary: 'Insurers price uncertainty aggressively for novel assets.' },
                    { id: 'weather-risk', label: 'Weather volatility changes storage underwriting assumptions', summary: 'Climate variance raises reserve and replacement expectations.' },
                    { id: 'counterparty-quality', label: 'Counterparty quality matters more than technology novelty', summary: 'Weak offtakers make innovative assets look unfinanceable.' },
                ],
            },
            {
                id: 'blended',
                label: 'Blended Finance',
                summary: 'Public risk absorption shifts private hurdle rates.',
                claims: [
                    { id: 'junior-capital', label: 'Junior capital can unlock stalled infrastructure', summary: 'First-loss tranches change lender willingness faster than grants.' },
                    { id: 'fx-risk', label: 'FX hedging is a core clean-tech issue in emerging markets', summary: 'Currency exposure can dominate equipment learning curves.' },
                    { id: 'credit-enhancement', label: 'Credit enhancement beats rate subsidies for early projects', summary: 'Guarantees reduce model uncertainty more directly.' },
                ],
            },
            {
                id: 'portfolio',
                label: 'Portfolio Strategy',
                summary: 'Investors allocate across risk, policy, and supply-chain exposure.',
                claims: [
                    { id: 'platform-play', label: 'Platform strategies outperform single-asset bets in fragmented markets', summary: 'Execution consistency beats isolated technical wins.' },
                    { id: 'merchant-risk', label: 'Merchant exposure is increasingly a software problem', summary: 'Forecasting and dispatch quality shape revenue variance.' },
                    { id: 'exit-liquidity', label: 'Exit liquidity is uneven across transition subsectors', summary: 'Not all green assets clear the same buyer universe.' },
                ],
            },
        ],
    },
    {
        id: 'workforce',
        label: 'Workforce & Delivery',
        summary: 'Labor availability and execution discipline determine how plans become assets.',
        rootId: 'topic:public-capacity',
        subclusters: [
            {
                id: 'training',
                label: 'Training Pipelines',
                summary: 'Skills pipelines shape how quickly sectors can absorb demand.',
                claims: [
                    { id: 'credential-speed', label: 'Credential speed matters more than curriculum breadth', summary: 'Faster certification unlocks field capacity sooner than broad but slow programs.' },
                    { id: 'apprenticeship-match', label: 'Apprenticeship matching is a hidden throughput issue', summary: 'Placement friction leaves paid training seats unused.' },
                    { id: 'midcareer-switchers', label: 'Mid-career switchers are the fastest labor pool to activate', summary: 'Transitioning adjacent trades can fill shortages faster than net-new entrants.' },
                ],
            },
            {
                id: 'field-ops',
                label: 'Field Operations',
                summary: 'Crew scheduling and rework rates change deployment speed.',
                claims: [
                    { id: 'site-handoffs', label: 'Poor site handoffs create compounding delays', summary: 'Small coordination misses ripple across commissioning timelines.' },
                    { id: 'rework-loops', label: 'Rework loops destroy installation margin', summary: 'Quality escapes show up as schedule slips before they appear in cost reports.' },
                    { id: 'seasonal-availability', label: 'Seasonal labor availability distorts project sequencing', summary: 'Weather windows shift the feasible deployment calendar.' },
                ],
            },
            {
                id: 'software',
                label: 'Execution Software',
                summary: 'Tools for planning and maintenance directly affect utilization.',
                claims: [
                    { id: 'dispatch-ux', label: 'Operator UX can be a system bottleneck', summary: 'Poor interfaces slow dispatch, diagnosis, and restoration work.' },
                    { id: 'maintenance-planning', label: 'Maintenance planning beats emergency response spending', summary: 'Scheduled work preserves asset uptime more effectively than heroic field fixes.' },
                    { id: 'data-quality', label: 'Data quality limits automation before algorithms do', summary: 'Messy field telemetry makes optimization unreliable.' },
                ],
            },
        ],
    },
    {
        id: 'supplychain',
        label: 'Supply Chains',
        summary: 'Manufacturing, minerals, and routing determine deployment realism.',
        rootId: 'topic:resilient-systems',
        subclusters: [
            {
                id: 'components',
                label: 'Component Manufacturing',
                summary: 'Factory readiness defines how fast demand can be served.',
                claims: [
                    { id: 'yield-learning', label: 'Yield learning outruns capacity announcements', summary: 'Nameplate expansions mean little if line yield remains unstable.' },
                    { id: 'supplier-tiering', label: 'Tier-two suppliers become hidden failure points', summary: 'System bottlenecks often sit below branded OEMs.' },
                    { id: 'tooling-lead', label: 'Tooling lead times set the true scaling horizon', summary: 'Procurement delays cap manufacturing before labor does.' },
                ],
            },
            {
                id: 'minerals',
                label: 'Critical Minerals',
                summary: 'Extraction, refining, and recycling create uneven resilience.',
                claims: [
                    { id: 'refining-gap', label: 'Refining capacity is the real choke point', summary: 'Ore supply matters less than processing concentration in key regions.' },
                    { id: 'recycling-loop', label: 'Recycling loops will not close fast enough for early demand', summary: 'Secondary supply is meaningful later than many roadmaps assume.' },
                    { id: 'local-content', label: 'Local-content rules can conflict with scaling speed', summary: 'Resilience policy and low-cost deployment often pull in opposite directions.' },
                ],
            },
            {
                id: 'routing',
                label: 'Routing & Distribution',
                summary: 'Movement of bulky equipment shapes where projects are feasible.',
                claims: [
                    { id: 'warehouse-latency', label: 'Warehouse latency can rival manufacturing latency', summary: 'Inventory dwell time adds silent delay between factory and field.' },
                    { id: 'oversize-loads', label: 'Oversize load permits constrain energy hardware movement', summary: 'Transport regulation matters for large components more than commodity freight.' },
                    { id: 'inventory-buffers', label: 'Inventory buffers are a strategic asset in volatile build cycles', summary: 'Small buffers reduce schedule variance more than they increase capital cost.' },
                ],
            },
        ],
    },
    {
        id: 'communities',
        label: 'Communities & Acceptance',
        summary: 'Public legitimacy and local participation shape whether projects stick.',
        rootId: 'topic:public-capacity',
        subclusters: [
            {
                id: 'siting',
                label: 'Siting & Land Use',
                summary: 'Physical placement determines conflict intensity.',
                claims: [
                    { id: 'land-competition', label: 'Land competition is a strategic constraint, not a PR issue', summary: 'Agriculture, housing, and habitat pressures directly shape project maps.' },
                    { id: 'visual-impact', label: 'Visual impact concerns require design responses, not messaging alone', summary: 'Geometry and placement change acceptance more than copywriting.' },
                    { id: 'tribal-consultation', label: 'Early consultation changes schedule reliability', summary: 'Trust and sequencing matter more than late-stage mitigation packages.' },
                ],
            },
            {
                id: 'benefits',
                label: 'Benefit Sharing',
                summary: 'Who gains locally affects project durability.',
                claims: [
                    { id: 'revenue-sharing', label: 'Revenue sharing outperforms one-off concessions', summary: 'Recurring local value is easier to defend politically.' },
                    { id: 'jobs-credibility', label: 'Job claims need credible local pathways', summary: 'Communities discount employment promises without visible pipelines.' },
                    { id: 'bill-savings', label: 'Bill savings are more legible than carbon benefits', summary: 'Direct household outcomes travel faster than abstract system gains.' },
                ],
            },
            {
                id: 'governance',
                label: 'Local Governance',
                summary: 'Institutional capacity changes whether agreements can be honored.',
                claims: [
                    { id: 'staff-capacity', label: 'Local staff capacity is a real climate deployment variable', summary: 'Small governments often cannot process complex projects quickly.' },
                    { id: 'procurement-rules', label: 'Procurement rules can delay local climate implementation', summary: 'Administrative friction turns approved plans into slow execution.' },
                    { id: 'trust-memory', label: 'Communities remember broken promises longer than developers expect', summary: 'Institutional memory affects future project timelines.' },
                ],
            },
        ],
    },
    {
        id: 'innovation',
        label: 'Innovation & Learning',
        summary: 'Pilot learning, standardization, and replication determine scaling quality.',
        rootId: 'topic:resilient-systems',
        subclusters: [
            {
                id: 'pilots',
                label: 'Pilots & Demonstrations',
                summary: 'Learning loops matter only if they transfer into deployment playbooks.',
                claims: [
                    { id: 'pilot-to-scale', label: 'Pilot success rarely translates without delivery playbooks', summary: 'Operational knowledge transfer matters more than demo optics.' },
                    { id: 'site-selection', label: 'Demo site selection biases performance narratives', summary: 'Highly curated pilots mislead deployment planning.' },
                    { id: 'measurement', label: 'Measurement quality determines whether pilots de-risk anything', summary: 'Weak instrumentation creates anecdote instead of learning.' },
                ],
            },
            {
                id: 'standards',
                label: 'Standards & Interoperability',
                summary: 'Common interfaces reduce integration drag across the stack.',
                claims: [
                    { id: 'protocol-fragmentation', label: 'Protocol fragmentation creates hidden O&M cost', summary: 'Interoperability failures surface after deployment, not before sale.' },
                    { id: 'testing-regimes', label: 'Testing regimes determine vendor trust', summary: 'Shared validation lowers integration anxiety.' },
                    { id: 'retrofit-compatibility', label: 'Backward compatibility matters for retrofit adoption', summary: 'Greenfield assumptions slow real-world rollout.' },
                ],
            },
            {
                id: 'replication',
                label: 'Replication Engines',
                summary: 'Repeatable playbooks determine whether a good project becomes a category.',
                claims: [
                    { id: 'template-contracts', label: 'Template contracts shorten deployment cycles', summary: 'Commercial standardization removes repeat negotiation drag.' },
                    { id: 'regional-copying', label: 'Regional copying beats bespoke optimization early on', summary: 'Fast imitation often outperforms locally perfect design.' },
                    { id: 'ops-handbooks', label: 'Operational handbooks scale faster than central experts', summary: 'Codified practice spreads capability more reliably than specialist teams.' },
                ],
            },
        ],
    },
];

const ROOT_TOPIC_SEEDS = [
    {
        id: 'topic:climate-transition',
        label: 'Climate Transition',
        summary: 'A large systemic transition topic spanning policy, infrastructure, and long-horizon deployment sequencing.',
    },
    {
        id: 'topic:industrial-rebuild',
        label: 'Industrial Rebuild',
        summary: 'A manufacturing and capital-planning topic focused on how sectors replace physical systems at scale.',
    },
    {
        id: 'topic:public-capacity',
        label: 'Public Capacity',
        summary: 'A governance and delivery topic focused on whether institutions and people can execute transition plans.',
    },
    {
        id: 'topic:resilient-systems',
        label: 'Resilient Systems',
        summary: 'A systems topic covering supply chains, standards, and how infrastructure remains robust under stress.',
    },
] as const;

export function createPersistedGraphMock(topicId: string): PersistedGraphMock {
    const nodes: Node<PersistedNodeData>[] = [];
    const edges: Edge[] = [];

    for (const rootTopic of ROOT_TOPIC_SEEDS) {
        nodes.push(
            createNode(
                rootTopic.id,
                rootTopic.label,
                topicId,
                undefined,
                'topic',
                rootTopic.summary,
            ),
        );
    }

    for (const cluster of CLUSTER_SEEDS) {
        const clusterId = `cluster:${cluster.id}`;
        nodes.push(createNode(clusterId, cluster.label, topicId, cluster.rootId, 'cluster', cluster.summary));
        edges.push(createContainsEdge(cluster.rootId, clusterId));

        for (const subcluster of cluster.subclusters) {
            const subclusterId = `subcluster:${cluster.id}:${subcluster.id}`;
            nodes.push(createNode(subclusterId, subcluster.label, topicId, clusterId, 'subcluster', subcluster.summary));
            edges.push(createContainsEdge(clusterId, subclusterId));

            const claims = [
                ...subcluster.claims,
                ...createSyntheticClaims(cluster, subcluster, EXTRA_CLAIMS_PER_SUBCLUSTER),
            ];

            for (const claim of claims) {
                const claimId = `claim:${cluster.id}:${subcluster.id}:${claim.id}`;
                nodes.push(createNode(claimId, claim.label, topicId, subclusterId, 'claim', claim.summary));
                edges.push(createContainsEdge(subclusterId, claimId));

                for (let detailIndex = 0; detailIndex < DETAILS_PER_CLAIM; detailIndex += 1) {
                    const detailId = `detail:${cluster.id}:${subcluster.id}:${claim.id}:${detailIndex}`;
                    const detailLabel = detailIndex === 0
                        ? 'Execution detail'
                        : (detailIndex === 1 ? 'Constraint detail' : 'Signal detail');
                    const detailSummary = detailIndex === 0
                        ? `${claim.label} depends on concrete delivery sequencing, local implementation, and operator throughput.`
                        : (detailIndex === 1
                            ? `${claim.label} is limited by financing, permitting, or supply-side bottlenecks that vary by region.`
                            : `${claim.label} becomes legible through recurring signals, lead indicators, and local measurement loops.`);
                    nodes.push(createNode(detailId, detailLabel, topicId, claimId, 'claim', detailSummary));
                    edges.push(createContainsEdge(claimId, detailId));

                    for (let leafIndex = 0; leafIndex < LEAVES_PER_DETAIL; leafIndex += 1) {
                        const leafId = `leaf:${cluster.id}:${subcluster.id}:${claim.id}:${detailIndex}:${leafIndex}`;
                        const leafLabel = leafIndex === 0 ? 'Case note' : 'Metric note';
                        const leafSummary = leafIndex === 0
                            ? `${claim.label} shows up differently across regions, operators, and delivery environments.`
                            : `${claim.label} can be tracked through local throughput, delay, cost, and adoption metrics.`;
                        nodes.push(createNode(leafId, leafLabel, topicId, detailId, 'claim', leafSummary));
                        edges.push(createContainsEdge(detailId, leafId));
                    }
                }
            }
        }
    }

    const claimIds = nodes
        .filter((node) => node.data.kind === 'claim')
        .map((node) => node.id);
    const subclusterIds = nodes
        .filter((node) => node.data.kind === 'subcluster')
        .map((node) => node.id);
    const clusterIds = nodes
        .filter((node) => node.data.kind === 'cluster')
        .map((node) => node.id);
    const rootTopicIds = ROOT_TOPIC_SEEDS.map((rootTopic) => rootTopic.id);

    for (let index = 0; index < claimIds.length; index += 1) {
        const sourceId = claimIds[index];
        const targetId = claimIds[(index + 5) % claimIds.length];
        const alternateId = claimIds[(index + 11) % claimIds.length];
        if (sourceId !== targetId) {
            edges.push(createRelationEdge(`rel:claim:${index}:a`, sourceId, targetId));
        }
        if (sourceId !== alternateId && index % 2 === 0) {
            edges.push(createRelationEdge(`rel:claim:${index}:b`, sourceId, alternateId));
        }
    }

    for (let index = 0; index < subclusterIds.length; index += 1) {
        const sourceId = subclusterIds[index];
        const targetId = subclusterIds[(index + 3) % subclusterIds.length];
        if (sourceId !== targetId) {
            edges.push(createRelationEdge(`rel:subcluster:${index}`, sourceId, targetId));
        }
    }

    for (let index = 0; index < clusterIds.length; index += 1) {
        const sourceId = clusterIds[index];
        const targetId = clusterIds[(index + 2) % clusterIds.length];
        if (sourceId !== targetId) {
            edges.push(createRelationEdge(`rel:cluster:${index}`, sourceId, targetId));
        }
    }

    for (let index = 0; index < rootTopicIds.length; index += 1) {
        const sourceId = rootTopicIds[index];
        const targetId = rootTopicIds[(index + 1) % rootTopicIds.length];
        if (sourceId !== targetId) {
            edges.push(createRelationEdge(`rel:root:${index}`, sourceId, targetId));
        }
    }

    return { nodes, edges };
}

function createNode(
    id: string,
    label: string,
    topicId: string,
    parentId: string | undefined,
    kind: string,
    contextSummary: string,
): Node<PersistedNodeData> {
    return {
        id,
        type: 'customTask',
        position: { x: 0, y: 0 },
        data: {
            nodeSource: 'persisted',
            topicId,
            label,
            kind,
            parentId,
            contextSummary,
            contentMd: `# ${label}\n\n${contextSummary}`,
        },
    };
}

function createContainsEdge(source: string, target: string): Edge {
    return {
        id: `e-${source}-${target}`,
        source,
        target,
        animated: true,
    };
}

function createRelationEdge(id: string, source: string, target: string): Edge {
    return {
        id,
        source,
        target,
        animated: false,
        style: {
            stroke: '#64748b',
            strokeDasharray: '6 4',
            strokeWidth: 2,
        },
    };
}

function createSyntheticClaims(
    cluster: ClusterSeed,
    subcluster: ClusterSeed['subclusters'][number],
    count: number,
) {
    return Array.from({ length: count }, (_, index) => ({
        id: `synthetic-${index + 1}`,
        label: `${subcluster.label} Pattern ${index + 1}`,
        summary: `${subcluster.label} in ${cluster.label} depends on repeated operational patterns, region-specific constraints, and compounding execution choices.`,
    }));
}
