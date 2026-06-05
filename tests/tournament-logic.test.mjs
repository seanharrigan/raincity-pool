import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const scoringApi = require('../js/scoring.js');
const { THIRD_PLACE_MAPPING } = require('../js/third-place-mapping.js');

const GROUP_LETTERS = 'ABCDEFGHIJKL'.split('');
const THIRD_PLACE_WINNER_SEEDS = ['1A', '1B', '1D', '1E', '1G', '1I', '1K', '1L'];

function loadTournamentApi() {
    const featuresPath = require.resolve('../js/features.js');
    delete require.cache[featuresPath];

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
    global.teams = deriveTeamsFromSchedule(api.GROUP_STAGE_SCHEDULE);
    return api;
}

function deriveTeamsFromSchedule(schedule) {
    const seen = new Map();
    let cost = 100;

    schedule.forEach((match) => {
        [match.home, match.away].forEach((teamName) => {
            if (seen.has(teamName)) return;
            seen.set(teamName, {
                name: teamName,
                group: match.group,
                flag: `:${teamName}:`,
                cost,
                qualified: true
            });
            cost -= 1;
        });
    });

    return [...seen.values()];
}

function buildCompletedGroupStage(schedule) {
    const teamsByGroup = new Map();
    const groupByName = new Map();

    schedule.forEach((match) => {
        if (!teamsByGroup.has(match.group)) teamsByGroup.set(match.group, []);
        const groupTeams = teamsByGroup.get(match.group);
        [match.home, match.away].forEach((teamName) => {
            if (!groupTeams.includes(teamName)) groupTeams.push(teamName);
            groupByName.set(teamName, match.group);
        });
    });

    const rankingByGroup = Object.fromEntries(
        [...teamsByGroup.entries()].map(([group, groupTeams]) => [group, groupTeams])
    );

    const resultByPair = new Map();
    GROUP_LETTERS.forEach((group, groupIndex) => {
        const [first, second, third, fourth] = rankingByGroup[group];
        const thirdWinGoals = 12 - groupIndex;

        resultByPair.set(pairKey(first, second), { winner: first, loser: second, winnerScore: 2, loserScore: 0 });
        resultByPair.set(pairKey(first, third), { winner: first, loser: third, winnerScore: 1, loserScore: 0 });
        resultByPair.set(pairKey(first, fourth), { winner: first, loser: fourth, winnerScore: 1, loserScore: 0 });
        resultByPair.set(pairKey(second, third), { winner: second, loser: third, winnerScore: 1, loserScore: 0 });
        resultByPair.set(pairKey(second, fourth), { winner: second, loser: fourth, winnerScore: 1, loserScore: 0 });
        resultByPair.set(pairKey(third, fourth), { winner: third, loser: fourth, winnerScore: thirdWinGoals, loserScore: 0 });
    });

    const matches = schedule.map((match, index) => {
        const result = resultByPair.get(pairKey(match.home, match.away));
        const score_home = match.home === result.winner ? result.winnerScore : result.loserScore;
        const score_away = match.away === result.winner ? result.winnerScore : result.loserScore;

        return {
            id: index + 1,
            stage: 'Group',
            match_date_manual: match.date,
            team_home: match.home,
            team_away: match.away,
            score_home,
            score_away
        };
    });

    return {
        matches,
        rankingByGroup,
        groupByName
    };
}

function pairKey(teamA, teamB) {
    return [teamA, teamB].sort().join('|');
}

function groupSeedName(rankingByGroup, label) {
    const pos = Number(label[0]) - 1;
    const group = label[1];
    return rankingByGroup[group][pos];
}

test('official FIFA third-place mapping table covers all 495 valid combinations cleanly', () => {
    assert.equal(Object.keys(THIRD_PLACE_MAPPING).length, 495);

    Object.entries(THIRD_PLACE_MAPPING).forEach(([qualifiedKey, mappingEntry]) => {
        assert.equal(typeof mappingEntry.rowNumber, 'number', `${qualifiedKey} should include the source CSV row number`);
        assert.ok(mappingEntry.rowNumber >= 1 && mappingEntry.rowNumber <= 495, `${qualifiedKey} should point to a valid CSV row`);

        const assignments = mappingEntry.assignments;
        assert.equal(qualifiedKey.length, 8, `${qualifiedKey} should contain 8 qualifying groups`);
        assert.equal(new Set(qualifiedKey.split('')).size, 8, `${qualifiedKey} should not repeat groups`);

        const assignmentKeys = Object.keys(assignments).sort();
        assert.deepEqual(assignmentKeys, [...THIRD_PLACE_WINNER_SEEDS].sort(), `${qualifiedKey} should assign all 8 winner seeds`);

        const assignmentValues = Object.values(assignments);
        assert.equal(assignmentValues.length, 8, `${qualifiedKey} should have 8 third-place assignments`);
        assert.equal(new Set(assignmentValues).size, 8, `${qualifiedKey} should not reuse a third-place seed`);

        assignmentValues.forEach((seed) => {
            assert.match(seed, /^3[A-L]$/, `${qualifiedKey} contains malformed seed ${seed}`);
            assert.ok(qualifiedKey.includes(seed[1]), `${qualifiedKey} should only assign qualified third-place groups`);
        });
    });
});

test('derived team status advances top two in every group and only the best eight third-place teams', () => {
    const api = loadTournamentApi();
    const { matches, rankingByGroup } = buildCompletedGroupStage(api.GROUP_STAGE_SCHEDULE);

    const statusRows = api._buildDerivedTeamStatusRows(matches);
    const statusByTeam = new Map(statusRows.map((row) => [row.team_name, row]));

    GROUP_LETTERS.forEach((group, groupIndex) => {
        const [first, second, third, fourth] = rankingByGroup[group];

        assert.equal(statusByTeam.get(first)?.advanced_to_knockouts, true, `${first} should auto-advance as 1${group}`);
        assert.equal(statusByTeam.get(second)?.advanced_to_knockouts, true, `${second} should auto-advance as 2${group}`);
        assert.equal(statusByTeam.get(fourth)?.eliminated, true, `${fourth} should be eliminated in 4${group}`);

        if (groupIndex < 8) {
            assert.equal(statusByTeam.get(third)?.advanced_to_knockouts, true, `${third} should qualify as a best third-place team`);
            assert.equal(statusByTeam.get(third)?.eliminated, false, `${third} should not be eliminated`);
        } else {
            assert.equal(statusByTeam.get(third)?.advanced_to_knockouts, false, `${third} should not qualify from third place`);
            assert.equal(statusByTeam.get(third)?.eliminated, true, `${third} should be eliminated once best-third ranking resolves`);
        }
    });
});

test('best third-place teams are ranked globally by group-stage performance', () => {
    const api = loadTournamentApi();
    const { matches, groupByName } = buildCompletedGroupStage(api.GROUP_STAGE_SCHEDULE);
    const standings = api.computeGroupStandings(matches);

    const thirdPlaceGroups = api._getBestThirdPlaceTeams(standings).map((team) => groupByName.get(team.name));

    assert.deepEqual(thirdPlaceGroups, GROUP_LETTERS);
});

test('round of 32 fixed pairings and best-third slots resolve without duplicates', () => {
    const api = loadTournamentApi();
    const { matches, rankingByGroup, groupByName } = buildCompletedGroupStage(api.GROUP_STAGE_SCHEDULE);
    const standings = api.computeGroupStandings(matches);
    const bestThirdAssignments = api._buildBestThirdAssignments(standings);
    const bestThirdSlots = new Map(api._getBestThirdSlots().map((slot) => [slot.key, slot]));
    const expectedMapping = THIRD_PLACE_MAPPING['ABCDEFGH'].assignments;

    assert.equal(bestThirdAssignments.size, 8);

    const r32Matches = api.KNOCKOUT_SCHEDULE.filter((match) => match.stage === 'R32');
    const seenTeams = new Set();
    const seenBestThirdTeams = new Set();

    const fixedLabelRe = /^[12][A-L]$/;
    r32Matches.forEach((match) => {
        const home = api._resolveKnockoutMatchTeam(match, 'home', standings, bestThirdAssignments);
        const away = api._resolveKnockoutMatchTeam(match, 'away', standings, bestThirdAssignments);

        assert.ok(home?.name, `resolved home team missing for ${match.slotKey}`);
        assert.ok(away?.name, `resolved away team missing for ${match.slotKey}`);
        assert.notEqual(home.name, away.name, `duplicate matchup in ${match.slotKey}`);

        if (fixedLabelRe.test(match.home)) {
            assert.equal(home.name, groupSeedName(rankingByGroup, match.home));
        }
        if (fixedLabelRe.test(match.away)) {
            assert.equal(away.name, groupSeedName(rankingByGroup, match.away));
        }

        [home.name, away.name].forEach((teamName) => {
            assert.equal(seenTeams.has(teamName), false, `${teamName} should appear only once in the Round of 32`);
            seenTeams.add(teamName);
        });

        [['home', home], ['away', away]].forEach(([side, resolvedTeam]) => {
            if (match[side] !== 'Best 3rd') return;
            const group = groupByName.get(resolvedTeam.name);
            const slot = bestThirdSlots.get(`${match.slotKey}:${side}`);
            const expectedSeed = expectedMapping[match.home];

            assert.ok(slot.allowedGroups.includes(group), `${resolvedTeam.name} should be valid for ${match.slotKey}:${side}`);
            assert.equal(resolvedTeam.seedLabel, expectedSeed);
            assert.equal(seenBestThirdTeams.has(resolvedTeam.name), false, `${resolvedTeam.name} should fill only one best-third slot`);
            seenBestThirdTeams.add(resolvedTeam.name);
        });
    });

    assert.equal(seenTeams.size, 32);
    assert.equal(seenBestThirdTeams.size, 8);
});

test('best-third assignments follow the official FIFA mapping table for a qualified-set key', () => {
    const api = loadTournamentApi();
    const { matches } = buildCompletedGroupStage(api.GROUP_STAGE_SCHEDULE);
    const standings = api.computeGroupStandings(matches);
    const bestThirdAssignments = api._buildBestThirdAssignments(standings);

    const expected = THIRD_PLACE_MAPPING['ABCDEFGH'].assignments;
    // Slot keys reflect the bracket-vertical R32 ordering — these are the
    // R32 entries whose away side is 'Best 3rd', keyed by the group-winner
    // playing home.
    const expectedSlotByWinner = {
        '1E': 'r32-01:away',
        '1I': 'r32-02:away',
        '1D': 'r32-07:away',
        '1G': 'r32-08:away',
        '1A': 'r32-11:away',
        '1L': 'r32-12:away',
        '1B': 'r32-15:away',
        '1K': 'r32-16:away'
    };

    Object.entries(expectedSlotByWinner).forEach(([winnerSeed, slotKey]) => {
        const assignedTeam = bestThirdAssignments.get(slotKey);
        assert.ok(assignedTeam, `missing assignment for ${slotKey}`);
        assert.equal(`3${assignedTeam.group}`, expected[winnerSeed]);
    });
});

test('later knockout slots can resolve one side as soon as an earlier match is finished', () => {
    const api = loadTournamentApi();
    const { matches } = buildCompletedGroupStage(api.GROUP_STAGE_SCHEDULE);
    const standings = api.computeGroupStandings(matches);
    const bestThirdAssignments = api._buildBestThirdAssignments(standings);

    const firstR32Match = api.KNOCKOUT_SCHEDULE.find((match) => match.slotKey === 'r32-01');
    const firstR16Match = api.KNOCKOUT_SCHEDULE.find((match) => match.slotKey === 'r16-01');
    const r32Home = api._resolveKnockoutMatchTeam(firstR32Match, 'home', standings, bestThirdAssignments, { matchesCache: matches });
    const r32Away = api._resolveKnockoutMatchTeam(firstR32Match, 'away', standings, bestThirdAssignments, { matchesCache: matches });

    const knockoutMatches = [
        ...matches,
        {
            id: 9999,
            stage: 'R32',
            match_date_manual: firstR32Match.date,
            team_home: r32Home.name,
            team_away: r32Away.name,
            score_home: 2,
            score_away: 1
        }
    ];

    const updatedStandings = api.computeGroupStandings(knockoutMatches);
    const updatedAssignments = api._buildBestThirdAssignments(updatedStandings);
    const resolvedHome = api._resolveKnockoutMatchTeam(firstR16Match, 'home', updatedStandings, updatedAssignments, { matchesCache: knockoutMatches });
    const resolvedAway = api._resolveKnockoutMatchTeam(firstR16Match, 'away', updatedStandings, updatedAssignments, { matchesCache: knockoutMatches });

    assert.equal(resolvedHome.name, r32Home.name);
    assert.equal(resolvedHome.status, 'confirmed');
    assert.equal(resolvedAway.name, 'TBD');
    assert.equal(resolvedAway.status, 'none');
});

// ── FIFA tiebreaker chain ────────────────────────────────────────────────────

function buildGroupAMatches(api, results) {
    // results: array of { home, away, scoreHome, scoreAway } using Group A team names
    const sched = api.GROUP_STAGE_SCHEDULE.filter((m) => m.group === 'A');
    return results.map((r, idx) => {
        const match = sched.find((m) =>
            (m.home === r.home && m.away === r.away) ||
            (m.home === r.away && m.away === r.home)
        );
        return {
            id: idx + 1,
            stage: 'Group',
            match_date_manual: match.date,
            team_home: r.home,
            team_away: r.away,
            score_home: r.scoreHome,
            score_away: r.scoreAway,
            is_finished: true,
            was_extra_time: false
        };
    });
}

test('H2H breaks pts/gd/gf tie between two teams in the same group', () => {
    const api = loadTournamentApi();
    // Mexico, South Africa, South Korea, Czechia in Group A. Construct so
    // Mexico and South Korea finish tied on pts/gd/gf, but Mexico beat South
    // Korea head-to-head — Mexico should rank higher.
    const matches = buildGroupAMatches(api, [
        // Round 1
        { home: 'Mexico',       away: 'South Africa', scoreHome: 1, scoreAway: 0 }, // MEX +1
        { home: 'South Korea',  away: 'Czechia',      scoreHome: 1, scoreAway: 0 }, // KOR +1
        // Round 2
        { home: 'Czechia',      away: 'South Africa', scoreHome: 1, scoreAway: 0 }, // CZE +1
        { home: 'Mexico',       away: 'South Korea',  scoreHome: 2, scoreAway: 1 }, // MEX beats KOR
        // Round 3
        { home: 'Czechia',      away: 'Mexico',       scoreHome: 1, scoreAway: 0 }, // CZE beats MEX
        { home: 'South Africa', away: 'South Korea',  scoreHome: 0, scoreAway: 1 }  // KOR +1
    ]);
    const standings = api.computeGroupStandings(matches);
    const teamsA = standings.A.teams;
    const mex = teamsA.find((t) => t.name === 'Mexico');
    const kor = teamsA.find((t) => t.name === 'South Korea');

    // Same pts/gd/gf
    assert.equal(mex.pts, kor.pts);
    assert.equal(mex.gd, kor.gd);
    assert.equal(mex.gf, kor.gf);

    // H2H: Mexico beat South Korea 2-1 → Mexico ranks higher
    const mexIdx = teamsA.findIndex((t) => t.name === 'Mexico');
    const korIdx = teamsA.findIndex((t) => t.name === 'South Korea');
    assert.ok(mexIdx < korIdx, `Mexico should rank above South Korea via H2H (got mex=${mexIdx}, kor=${korIdx})`);
});

test('3-way tie resolves via overall gd after H2H is exhausted', () => {
    const api = loadTournamentApi();
    // Construct a three-way tie among Mexico/South Africa/South Korea where
    // every H2H match between them is 0-0 → H2H pts/gd/gf are all identical.
    // Each beat Czechia by different margins → overall gd breaks the tie.
    const matches = buildGroupAMatches(api, [
        { home: 'Mexico',       away: 'South Africa', scoreHome: 0, scoreAway: 0 },
        { home: 'South Korea',  away: 'Czechia',      scoreHome: 3, scoreAway: 0 }, // KOR +3
        { home: 'Czechia',      away: 'South Africa', scoreHome: 0, scoreAway: 2 }, // RSA +2
        { home: 'Mexico',       away: 'South Korea',  scoreHome: 0, scoreAway: 0 },
        { home: 'Czechia',      away: 'Mexico',       scoreHome: 0, scoreAway: 1 }, // MEX +1
        { home: 'South Africa', away: 'South Korea',  scoreHome: 0, scoreAway: 0 }
    ]);
    const standings = api.computeGroupStandings(matches);
    const teamsA = standings.A.teams;

    // All three should have same pts (5 each: W + 2D)
    const top3 = teamsA.slice(0, 3);
    assert.deepEqual(top3.map((t) => t.pts), [5, 5, 5]);

    // After exhausting H2H (all 0-0), fallback to overall gd: KOR +3 > RSA +2 > MEX +1
    assert.deepEqual(top3.map((t) => t.name), ['South Korea', 'South Africa', 'Mexico']);
});

test('uniqueness-safe fallback assigns Best 3rd slots without duplicates when official mapping is unresolvable', () => {
    const api = loadTournamentApi();
    // Run completed group stage but tamper with one team so qualified-thirds
    // ranking has a tie at the cutoff (the boundary 8th vs 9th place are tied).
    const { matches } = buildCompletedGroupStage(api.GROUP_STAGE_SCHEDULE);
    const standings = api.computeGroupStandings(matches);
    const slots = api._getBestThirdSlots();

    // Force the fallback path even when official mapping resolves.
    const fallback = api._buildFallbackBestThirdAssignments(standings);
    assert.equal(fallback.size, slots.length, 'fallback should fill all 8 Best 3rd slots');

    const seen = new Set();
    for (const team of fallback.values()) {
        assert.equal(seen.has(team.name), false, `fallback assigned ${team.name} twice`);
        seen.add(team.name);
    }
    assert.equal(seen.size, 8);

    // Every assigned team's group must be in its slot's allowedGroups.
    for (const slot of slots) {
        const team = fallback.get(slot.key);
        assert.ok(team, `fallback missing slot ${slot.key}`);
        assert.ok(slot.allowedGroups.includes(team.group),
            `${team.name} (group ${team.group}) is not allowed in ${slot.key} (${slot.allowedGroups.join(',')})`);
    }
});

test('fifaRank decides in-group tie when overall + H2H stats are all equal, and emits a tiebreaker warning', () => {
    const api = loadTournamentApi();
    // Mexico (FIFA #15) and South Korea (#25) finish identical on
    // pts/gd/gf AND draw 1-1 head-to-head — every step before fifaRank ties.
    // Mexico must rank higher than South Korea, and audit.tiebreakerWarnings
    // must surface the tie so it can be displayed as a yellow warning.
    const matches = buildGroupAMatches(api, [
        { home: 'Mexico',       away: 'South Africa', scoreHome: 2, scoreAway: 0 },
        { home: 'South Korea',  away: 'Czechia',      scoreHome: 2, scoreAway: 0 },
        { home: 'Czechia',      away: 'South Africa', scoreHome: 1, scoreAway: 0 },
        { home: 'Mexico',       away: 'South Korea',  scoreHome: 1, scoreAway: 1 },
        { home: 'Czechia',      away: 'Mexico',       scoreHome: 0, scoreAway: 0 },
        { home: 'South Africa', away: 'South Korea',  scoreHome: 0, scoreAway: 0 }
    ]);

    const standings = api.computeGroupStandings(matches);
    const teamsA = standings.A.teams;
    const mex = teamsA.find((t) => t.name === 'Mexico');
    const kor = teamsA.find((t) => t.name === 'South Korea');

    // Sanity: Mexico and South Korea identical on every on-pitch stat.
    assert.equal(mex.pts, 5);
    assert.equal(kor.pts, 5);
    assert.equal(mex.gd, kor.gd);
    assert.equal(mex.gf, kor.gf);

    // FIFA ranking should rank Mexico (#15) above South Korea (#25).
    const mexIdx = teamsA.findIndex((t) => t.name === 'Mexico');
    const korIdx = teamsA.findIndex((t) => t.name === 'South Korea');
    assert.ok(mexIdx < korIdx, `Mexico (FIFA #15) should rank above South Korea (FIFA #25); got mex=${mexIdx}, kor=${korIdx}`);

    // The audit should surface this as a tiebreaker warning.
    const audit = api.buildTournamentAudit(matches);
    const groupWarnings = audit.tiebreakerWarnings.filter((w) => w.scope === 'group' && w.group === 'A');
    assert.equal(groupWarnings.length, 1, `expected 1 group-A tiebreaker warning, got ${audit.tiebreakerWarnings.length} total`);

    const warning = groupWarnings[0];
    const warnedNames = warning.teams.map((t) => t.name).sort();
    assert.deepEqual(warnedNames, ['Mexico', 'South Korea']);
    assert.equal(warning.sharedStats.pts, 5);
    assert.equal(warning.sharedStats.gd, mex.gd);
    assert.equal(warning.sharedStats.gf, mex.gf);

    // Warnings are advisory only — overall pass shouldn't be downgraded.
    assert.equal(audit.summary.tiebreakerWarningCount, 1);
});

test('_getFifaRank returns the official rank for known teams and 999 for unknowns', () => {
    const api = loadTournamentApi();
    assert.equal(api._getFifaRank('France'), 1);
    assert.equal(api._getFifaRank('Spain'), 2);
    assert.equal(api._getFifaRank('Mexico'), 15);
    assert.equal(api._getFifaRank('South Korea'), 25);
    assert.equal(api._getFifaRank('Atlantis'), 999);
    assert.equal(api._getFifaRank(undefined), 999);
});

// ── Randomized stress test ──────────────────────────────────────────────────
// Quick statistical guard against regressions. The full N-run stress lives at
// `npm run stress` (see tests/stress-sim.mjs). 25 runs here adds ~100ms to
// `npm test` and exercises the H2H + Annex C + dedup paths many times over.

function simulateRandomTournament(api) {
    const randScore = () => [Math.floor(Math.random() * 5), Math.floor(Math.random() * 5)];

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
            if (h === a) h += 1;
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

test('25 randomized tournaments all pass schedule, bracket, group, structural, and dedup checks', () => {
    const api = loadTournamentApi();
    const RUNS = 25;
    let totalDupes = 0;
    const failures = [];

    for (let i = 0; i < RUNS; i++) {
        const audit = simulateRandomTournament(api);
        const dupes = Object.values(audit.duplicatesByRound).reduce((s, arr) => s + arr.length, 0);
        totalDupes += dupes;

        if (!audit.summary.overallPass || dupes > 0
            || audit.summary.bracketPassCount !== 32
            || audit.summary.groupPassCount !== 12) {
            failures.push({
                run: i + 1,
                schedule: audit.summary.scheduleFailCount,
                bracket: audit.summary.bracketFailCount,
                groups: audit.summary.groupFailCount,
                structural: audit.summary.structuralFailCount,
                dupes
            });
        }
    }

    assert.equal(totalDupes, 0, `expected 0 duplicates across ${RUNS} runs, got ${totalDupes}`);
    assert.deepEqual(failures, [], `expected no failures, got ${failures.length}: ${JSON.stringify(failures.slice(0, 3))}`);
});
