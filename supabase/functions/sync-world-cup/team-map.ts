// Translation tables: football-data.org names → names used in this repo's
// `teams` array (js/data.js) and `matches` table.
//
// Anything not in TEAM_NAME_MAP is assumed to match exactly (and most do —
// Spain, England, France, Argentina, Brazil, Portugal, Germany, Netherlands,
// Norway, Belgium, Colombia, Morocco, Japan, Mexico, Switzerland, Uruguay,
// Ecuador, Croatia, Austria, Senegal, Sweden, Canada, Paraguay, Scotland,
// Egypt, Algeria, Ghana, Australia, Tunisia, Iran, Qatar, South Africa,
// Saudi Arabia, Panama, New Zealand, Iraq, Cape Verde, Uzbekistan, Jordan,
// Haiti, Italy).
//
// These are starter mappings based on football-data.org's typical FIFA naming.
// Refine once we see the actual API response for the WC competition.

export const TEAM_NAME_MAP: Record<string, string> = {
    "United States": "USA",
    "Turkey": "Turkiye",
    "Türkiye": "Turkiye",
    "Korea Republic": "South Korea",
    "Côte d'Ivoire": "Ivory Coast",
    "Cote d'Ivoire": "Ivory Coast",
    "Congo DR": "DR Congo",
    "DR Congo": "DR Congo",
    "Bosnia and Herzegovina": "Bosnia",
    "Bosnia-Herzegovina": "Bosnia",
    "Czech Republic": "Czechia",
    "Curaçao": "Curacao",
    "Cape Verde Islands": "Cape Verde",
};

// football-data.org stage names → this repo's `matches.stage` codes.
// `THIRD_PLACE_PLAYOFF` deliberately omitted — pool doesn't track it.
export const STAGE_MAP: Record<string, string> = {
    GROUP_STAGE: "Group",
    LAST_16: "R16",
    ROUND_OF_32: "R32",
    ROUND_OF_16: "R16",
    QUARTER_FINALS: "QF",
    SEMI_FINALS: "SM",
    FINAL: "F",
};

export function mapTeam(apiName: string): string {
    return TEAM_NAME_MAP[apiName] || apiName;
}

export function mapStage(apiStage: string): string | null {
    return STAGE_MAP[apiStage] || null;
}
