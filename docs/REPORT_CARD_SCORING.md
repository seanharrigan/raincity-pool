# Report Card Scoring System

Each player's squad receives a score from 0–100, converted to a letter grade (A+ through F).

---

## Final Score Formula

```
Score = (Odds Value × 40%) + (FIFA Rankings × 30%) + (Squad Balance × 30%)
```

All three components are normalised to 0–100 before weighting.

---

## Component 1 — Odds Value (40%)

Measures how much tournament win probability you extracted per budget point spent.

```
valueRatio    = team.winProbability / team.cost       (for each team)
avgValue      = average valueRatio across all 8 teams
valueNorm     = min(avgValue / 0.106 × 100, 100)
```

**Why 0.106?** That is the average win/cost ratio of the best legal 8-team squad you could pick under the pool rules (e.g. Spain + Netherlands + Norway + South Korea + Egypt + Czechia + Canada + Jordan, cost $149). It's the realistic ceiling, not a single-team theoretical max.

Team win probabilities come from a blend of DraftKings, ESPN, and BetMGM World Cup outright odds converted to implied probabilities.

---

## Component 2 — FIFA Rankings (30%)

Measures the average FIFA ranking quality of your squad.

```
rankScore (per team) = max(0, round((1 - (fifaRank - 1) / 89) × 100))
avgRank              = average rankScore across all 8 teams
```

FIFA rank 1 → 100 points. FIFA rank 90 → 0 points. Linear scale across the 90-team field.

---

## Component 3 — Squad Balance (30%)

Reflects how smartly you used your tier constraints. Tier 2 quality is weighted heaviest because it's the primary differentiator — tier 2 teams range from genuine contenders (Netherlands, Belgium) to also-rans (Canada, Paraguay).

```
balanceScore = tier2Quality × 50% + tier3Quality × 30% + tier1Score × 20%
```

### Tier 2 Quality
```
bestTier2Avg  = average winProb of the 4 best tier 2 teams available
myTier2Avg    = average winProb of your tier 2 picks
tier2Quality  = min(100, myTier2Avg / bestTier2Avg × 100)
```

### Tier 3 Quality
```
bestTier3Avg  = average winProb of the 3 best tier 3 teams available
myTier3Avg    = average winProb of your tier 3 picks
tier3Quality  = min(100, myTier3Avg / bestTier3Avg × 100)
```

### Tier 1 Usage
```
tier1Score = 85 if you picked exactly 1 tier 1 team
           = 40 if you picked none (legal but suboptimal)
```
(Picking 2+ tier 1 teams is not allowed by pool rules.)

---

## Grade Thresholds

| Score | Grade |
|-------|-------|
| 90+ | A+ |
| 85–89 | A |
| 80–84 | A− |
| 75–79 | B+ |
| 70–74 | B |
| 65–69 | B− |
| 58–64 | C+ |
| 50–57 | C |
| 40–49 | C− |
| 25–39 | D |
| 0–24 | F |

---

## Expected Score Distribution

| Squad type | Score | Grade |
|---|---|---|
| Best legal squad (Spain + top tier-2s) | ~90+ | A/A+ |
| Strong squad with good tier-2 picks | 70–78 | B/B+ |
| Average balanced squad | 55–62 | C+/B− |
| All-budget squad, no tier-1 | 35–45 | C−/D |
| Pure contrarian ($2 teams only) | ~25–35 | D/C− |

---

## Flavor Text

Below the grade tagline, a personalised one-liner is shown based on squad composition. Priority order:

1. **Favourite team in squad** — "Picking [team]? Not biased at all. Totally objective."
2. **2+ host nation picks** (USA/Canada/Mexico) — "[team] and [team] at a home World Cup — brave, or just patriotic?"
3. **1 host nation pick** — "[team] at home. Heart says yes. Odds say… we'll see."
4. **2+ contrarian $2 teams** (Cape Verde/Curacao/Uzbekistan/Jordan/Haiti) — "[team] and [team]? The scout reports must be incredible."
5. **1 contrarian $2 team** — "[team] in the squad. Bold. Very bold."
6. **No tier-1 team** — "No tier 1 team? Either a bold contrarian or a strict budget hawk."
7. **3+ eliminated teams** — "[N] teams already eliminated. Respect the commitment."
8. **Total cost ≤ $80** — "Under $80 total? Either genius budgeting or a very optimistic outlook."
9. **Total cost ≥ $140** — "Nearly maxing the budget — all in on quality. No room for sentiment."
10. **Default** — "Solid, unremarkable, reliable. The Switzerland of fantasy squads."

For the logged-in user's own card, the favourite team check uses their saved profile. For other players' cards, only squad composition is used.

---

## Implementation

All logic lives in `_computeReportCard()` and `_computeFlavorText()` in `js/features.js`.
