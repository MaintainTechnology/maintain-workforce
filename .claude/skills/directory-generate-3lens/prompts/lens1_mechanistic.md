# Lens 1: First-Principles Mechanistic Analysis

You are conducting a first-principles mechanistic analysis of **{{product_name}}**.

## Objective

Explain HOW this product works from foundational principles. Focus on mechanism, not efficacy claims. Your goal is to help a longevity-focused physician understand the product at a molecular/systems level.

## Input

- **Product Name:** {{product_name}}
- **Product Category (if known):** {{product_category}}
- **Initial Context:** {{initial_context}}
- **KBV2 Context Dossier:** {{kbv2_dossier}} — Contains grounding pathways, molecular targets, and diagram elements from the local knowledge base review

## KBV2 Grounding (MANDATORY)

Before generating mechanistic analysis from scratch, consult the KBV2 dossier's `lens_priming.for_lens_1`:

1. **`grounding_pathways`** — These are curated KBV2 pathway files that directly relate to this product. Your mechanism map MUST be consistent with these pathway descriptions. If the KBV2 pathway file describes a specific signaling cascade (e.g., FFAR2/FFAR3 → GLP-1 secretion via Gαi/Gαq coupling), use those precise molecular details rather than generating generic descriptions.

2. **`key_targets_to_map`** — Molecular targets identified during the KBV2 review. These should appear in your output with their correct gene symbols and pathway roles.

3. **`diagram_elements`** — Suggested elements for the SVG pathway diagram based on the network structure discovered during KBV2 review.

**The KBV2 dossier also provides:**
- Cross-document connections showing how pathways interrelate
- Recurring themes that should inform your narrative structure
- Specific dosing and implementation patterns from intervention files
- Biomarker interpretation context from biomarker files

**Example of KBV2-grounded analysis:**
Instead of: "Butyrate is a short-chain fatty acid that supports gut health"
Write: "Butyrate is the obligate primary fuel for colonocyte mitochondrial beta-oxidation, accounting for approximately 70% of colonocyte ATP production. This robust oxidative consumption maintains physiological luminal hypoxia — the steep oxygen gradient essential for obligate anaerobe stability and resistance to facultative anaerobe (e.g., Enterobacteriaceae) expansion. PPARG activation by butyrate in colonocytes reinforces fatty acid oxidation and suppresses luminal oxygen and nitrate availability (KBV2: pathway_gut_incretin_scfa_signaling)."

## Process

### Step 1: Product Classification

Classify the product into one of these categories:

| Category | Description | Examples |
|----------|-------------|----------|
| `biological` | Interacts with biological systems (supplements, peptides, drugs) | Metformin, NAD+ precursors, Rapamycin |
| `technological` | Uses technology for measurement or intervention | CGMs, wearables, diagnostic tests |
| `service` | Delivers care or expertise | Telehealth platforms, longevity clinics |
| `hybrid` | Combines multiple categories | AI-powered diagnostics, smart supplements |

### Step 2: Identify Primary Targets

For **biological** products:
- Identify molecular targets (receptors, enzymes, transporters)
- Use HGNC gene symbols where applicable (e.g., MTOR, AMPK/PRKAA1)
- Note direct vs. indirect effects

For **technological** products:
- Identify what is being measured or modulated
- Note the sensing mechanism or intervention pathway

For **service** products:
- Identify the core value delivery mechanism
- Note what expertise or process is being provided

### Step 3: Map Signaling Pathways

Create a clear pathway map showing:

```
TRIGGER → PRIMARY EFFECT → SECONDARY EFFECTS → DOWNSTREAM OUTCOMES
```

For biological products, map:
- Upstream triggers (what activates the pathway)
- Core signaling nodes
- Downstream effectors
- Physiological outcomes

Include pathway crosstalk where relevant (e.g., AMPK ←→ mTOR).

### Step 4: Generate SVG Pathway Diagram

Create an SVG diagram illustrating the mechanism. Follow these specifications:

**Technical Requirements:**
- ViewBox: `0 0 800 600` (or appropriate for content)
- Minimum 40px padding on all sides
- Text must not overflow containers
- Use clear directional arrows (→, ←, ↔)
- Color code by function:
  - Activators: `#22c55e` (green)
  - Inhibitors: `#ef4444` (red)
  - Targets: `#3b82f6` (blue)
  - Outcomes: `#8b5cf6` (purple)

**Content Requirements:**
- Label all nodes clearly
- Show direction of effect (activation vs. inhibition)
- Include the product's point of intervention
- Keep text readable (minimum 12px font)

### Step 5: Create Educational Analogies

Generate 1-2 memorable analogies that help explain the mechanism to a clinician. Good analogies:
- Connect to familiar concepts
- Illuminate non-obvious aspects
- Are accurate (don't oversimplify to the point of incorrectness)

**Example:** "Rapamycin acts like a thermostat reset for cellular growth—by inhibiting mTORC1, it tells the cell to pause building projects and focus on maintenance and repair."

## Output Format

Return a JSON object with this structure:

```json
{
  "mechanism_type": "biological|technological|service|hybrid",
  "product_classification": {
    "category": "...",
    "subcategory": "...",
    "rationale": "..."
  },
  "primary_targets": [
    {
      "target": "AMPK (PRKAA1/PRKAA2)",
      "effect": "activation",
      "mechanism": "Inhibits mitochondrial Complex I, increasing AMP/ATP ratio",
      "evidence_type": "EXPLICIT"
    }
  ],
  "pathway_map": {
    "trigger": "Oral administration → gut absorption → hepatic uptake",
    "primary_effects": [
      "Complex I inhibition → ↑AMP/ATP ratio",
      "AMPK activation"
    ],
    "secondary_effects": [
      "mTORC1 inhibition",
      "Enhanced autophagy",
      "Reduced hepatic gluconeogenesis"
    ],
    "downstream_outcomes": [
      "Improved insulin sensitivity",
      "Reduced fasting glucose",
      "Potential longevity effects via nutrient sensing"
    ]
  },
  "pathway_crosstalk": [
    {
      "pathway_a": "AMPK signaling",
      "pathway_b": "mTOR signaling",
      "relationship": "AMPK inhibits mTORC1 via TSC2 phosphorylation"
    }
  ],
  "pathway_diagram_svg": "<svg viewBox='0 0 800 600'>...</svg>",
  "educational_analogies": [
    {
      "analogy": "...",
      "concept_illuminated": "..."
    }
  ],
  "first_principles_markdown": "## How {{product_name}} Works\n\n..."
}
```

## Quality Criteria (Self-Check Before Submission)

Before returning your output, verify:

- [ ] **L1.1 mechanism_depth**: Are specific targets named (genes, proteins, receptors)?
- [ ] **L1.2 pathway_accuracy**: Are pathways correctly mapped with direction of effect?
- [ ] **L1.3 cascade_completeness**: Does it show trigger → primary → secondary → outcome?
- [ ] **L1.4 analogy_quality**: Is there at least one memorable, accurate analogy?
- [ ] **L1.5 diagram_validity**: Does SVG have proper viewBox, padding, and readable text?
- [ ] **L1.6 first_principles_not_claims**: Does it explain HOW, not whether IF it works?

You must pass 5/6 criteria. If you identify a gap, address it before returning.

## Critical Reminders

1. **Explain mechanism, not efficacy** - This lens is about HOW, not IF
2. **Be specific** - Use gene symbols, pathway names, not vague terms
3. **Accuracy over simplicity** - Don't oversimplify to the point of incorrectness
4. **Neutral tone** - Present mechanism without promotional language
5. **Cite uncertainty** - If mechanism is debated or unclear, say so
