// Stress test: run N tournament simulations against the production logic
// and report aggregate audit metrics. Use to gain statistical confidence
// that the bracket builds cleanly across many random group-stage outcomes.
//
// Usage:
//   npm run stress              (default 100 runs)
//   STRESS_RUNS=500 npm run stress
//
// Not auto-included by `npm test` (filename intentionally lacks `.test.mjs`).

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RUNS = Number(process.env.STRESS_RUNS) || 100;

const scoringApi = require('../js/scoring.js');
const { THIRD_PLACE_MAPPING } = require('../js/third-place-mapping.js');

global.window = { WorldCupScoring: scoringApi, addEventListener: () => {} };
global.window.WorldCupThirdPlaceMapping = { THIRD_PLACE_MAPPING };
global.document = {
    getElementById: () => null,
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild: () => {} }
};
global.supabaseClient = {};
global.advancedTeams = new Set();
global.eliminatedTeams = new Set();
global.teams = [];

const api = require('../js/features.js');

const seenTeams = new Map();
let cost = 100;
api.GROUP_STAGE_SCHEDULE.forEach((m) => {
    [m.home, m.away].forEach((name) => {
        if (seenTeams.has(name)) return;
        seenTeams.set(name, { name, group: m.group, flag: ':x:', cost, qualified: true });
        cost--;
    });
});
global.teams = [...seenTeams.values()];

function randScore() {
    return [Math.floor(Math.random() * 5), Math.floor(Math.random() * 5)];
}

function simulateOnce() {
    const groupMatches = api.GROUP_STAGE_SCHEDULE.map((m, idx) => {
        const [h, a] = randScore();
        return {
            id: idx + 1, stage: 'Group', match_date_manual: m.date,
            team_home: m.home, team_away: m.away,
            score_home: h, score_away: a,
            is_finished: true, was_extra_time: false
        };
    });

    const standings = api.computeGroupStandings(groupMatches);
    const assigns = api._buildBestThirdAssignments(standings);
    const memo = {};
    let allMatches = [...groupMatches];

    const cascadeStage = (stage, idBase) => {
        const sched = api.KNOCKOUT_SCHEDULE.filter((m) => m.stage === stage);
        const newRows = sched.map((s, idx) => {
            const homeRes = api._resolveKnockoutMatchTeam(s, 'home', standings, assigns, { matchesCache: allMatches, memo });
            const awayRes = api._resolveKnockoutMatchTeam(s, 'away', standings, assigns, { matchesCache: allMatches, memo });
            let [h, a] = randScore();
            if (h === a) h += 1; // force a winner
            return {
                id: idBase + idx, stage, match_date_manual: s.date,
                team_home: homeRes.name, team_away: awayRes.name,
                score_home: h, score_away: a,
                is_finished: true, was_extra_time: false
            };
        });
        allMatches = [...allMatches, ...newRows];
    };

    cascadeStage('R32', 200);
    cascadeStage('R16', 300);
    cascadeStage('Quarters', 400);
    cascadeStage('Semis', 500);
    cascadeStage('Finals', 600);

    return api.buildTournamentAudit(allMatches);
}

function summarize(audits) {
    const passes = audits.filter((a) => a.summary.overallPass).length;
    const totalDupes = audits.reduce((s, a) =>
        s + Object.values(a.duplicatesByRound).reduce((s2, arr) => s2 + arr.length, 0), 0);
    const bestThirdResolvedCount = audits.filter((a) => a.summary.bestThirdResolved).length;
    const bracketCounts = audits.reduce((acc, a) => {
        acc[a.summary.bracketPassCount] = (acc[a.summary.bracketPassCount] || 0) + 1;
        return acc;
    }, {});
    const structFails = audits.filter((a) => a.summary.structuralFailCount > 0).length;
    const schedFails = audits.filter((a) => a.summary.scheduleFailCount > 0).length;
    const groupFails = audits.filter((a) => a.summary.groupFailCount > 0).length;

    return {
        runs: audits.length,
        overallPass: passes,
        totalDupes,
        bestThirdResolvedCount,
        bracketCounts,
        structFails,
        schedFails,
        groupFails
    };
}

console.log(`Running ${RUNS} tournament simulations…\n`);
const start = Date.now();
const audits = [];
const failures = [];

for (let i = 0; i < RUNS; i++) {
    const audit = simulateOnce();
    audits.push(audit);
    if (!audit.summary.overallPass) failures.push({ run: i + 1, audit });
    if ((i + 1) % 25 === 0) {
        process.stdout.write(`  ${i + 1}/${RUNS}\n`);
    }
}
const elapsed = Date.now() - start;

const stats = summarize(audits);

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`RESULTS — ${stats.runs} simulations, ${elapsed}ms total (${(elapsed / stats.runs).toFixed(1)}ms/run)`);
console.log('══════════════════════════════════════════════════════════════════\n');

const passLine = stats.overallPass === stats.runs
    ? `✅ Overall PASS:           ${stats.overallPass} / ${stats.runs}`
    : `❌ Overall PASS:           ${stats.overallPass} / ${stats.runs}`;
console.log(passLine);
console.log(`✅ Schedule failures:      ${stats.schedFails} (expect 0)`);
console.log(`✅ Group failures:         ${stats.groupFails} (expect 0)`);
console.log(`✅ Structural failures:    ${stats.structFails} (expect 0)`);
console.log(`✅ Total duplicates:       ${stats.totalDupes} (expect 0)`);
console.log(`📊 Best 3rd resolved:      ${stats.bestThirdResolvedCount} / ${stats.runs} (${(100 * stats.bestThirdResolvedCount / stats.runs).toFixed(1)}%)`);

console.log('\n📊 Bracket pass distribution (of 32):');
Object.entries(stats.bracketCounts)
    .sort(([a], [b]) => Number(b) - Number(a))
    .forEach(([count, freq]) => {
        const bar = '█'.repeat(Math.round(40 * freq / stats.runs));
        console.log(`     ${count}/32: ${freq.toString().padStart(3)}× ${bar}`);
    });

if (failures.length > 0) {
    console.log(`\n⚠️  ${failures.length} failure(s) — first 3 detailed:`);
    failures.slice(0, 3).forEach(({ run, audit }) => {
        console.log(`\n  Run ${run}:`);
        console.log(`    Schedule fail: ${audit.summary.scheduleFailCount}, Bracket fail: ${audit.summary.bracketFailCount}, Groups fail: ${audit.summary.groupFailCount}, Structural fail: ${audit.summary.structuralFailCount}`);
        const dupes = Object.entries(audit.duplicatesByRound).filter(([, a]) => a.length);
        if (dupes.length) console.log(`    Duplicates:`, Object.fromEntries(dupes));
        if (audit.structural.r32GroupCheck.issues.length) {
            console.log(`    R32 issues (first 3):`, audit.structural.r32GroupCheck.issues.slice(0, 3));
        }
    });
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(stats.overallPass === stats.runs && stats.totalDupes === 0
    ? '✅ HIGH CONFIDENCE: Tournament logic is sound across random group results.'
    : '⚠️  Issues found — see failures above.');
console.log('══════════════════════════════════════════════════════════════════');

process.exit(stats.overallPass === stats.runs ? 0 : 1);
