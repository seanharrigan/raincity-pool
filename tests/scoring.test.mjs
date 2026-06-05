import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    STAGE_MULTIPLIERS,
    getMatchPointsForTeam,
    buildTeamPointsMap,
    buildAdvancedTeamsSet,
    buildTeamStageBreakdownMap,
    buildProfilesMap,
    buildLeaderboardData,
    buildBestAvailableTeamData
} = require('../js/scoring.js');

const teams = [
    { name: 'Spain', flag: '🇪🇸', cost: 50, tier: 1 },
    { name: 'Morocco', flag: '🇲🇦', cost: 25, tier: 2 },
    { name: 'Canada', flag: '🇨🇦', cost: 10, tier: 2 },
    { name: 'Iraq', flag: '🇮🇶', cost: 4, tier: 3 }
];

test('stage multipliers match the pool rules', () => {
    assert.deepEqual(STAGE_MULTIPLIERS, {
        Group: 1,
        R32: 2,
        R16: 3,
        Quarters: 5,
        Semis: 8,
        Finals: 12
    });
});

test('group draw awards 1 point to each team in the match', () => {
    const match = {
        stage: 'Group',
        team_home: 'Spain',
        team_away: 'Morocco',
        score_home: 1,
        score_away: 1
    };

    assert.equal(getMatchPointsForTeam(match, 'Spain'), 1);
    assert.equal(getMatchPointsForTeam(match, 'Morocco'), 1);
    assert.equal(getMatchPointsForTeam(match, 'Canada'), 0);
});

test('knockout win applies the correct multiplier', () => {
    const r16Match = {
        stage: 'R16',
        team_home: 'Canada',
        team_away: 'Iraq',
        score_home: 2,
        score_away: 1
    };

    const finalMatch = {
        stage: 'Finals',
        team_home: 'Spain',
        team_away: 'Morocco',
        score_home: 3,
        score_away: 2
    };

    assert.equal(getMatchPointsForTeam(r16Match, 'Canada'), 9);
    assert.equal(getMatchPointsForTeam(r16Match, 'Iraq'), 0);
    assert.equal(getMatchPointsForTeam(finalMatch, 'Spain'), 36);
});

test('every knockout stage uses the expected multiplier in scoring', () => {
    const stageExpectations = [
        ['R32', 6],
        ['R16', 9],
        ['Quarters', 15],
        ['Semis', 24],
        ['Finals', 36]
    ];

    stageExpectations.forEach(([stage, expectedPoints]) => {
        const match = {
            stage,
            team_home: 'Spain',
            team_away: 'Morocco',
            score_home: 1,
            score_away: 0
        };

        assert.equal(getMatchPointsForTeam(match, 'Spain'), expectedPoints);
        assert.equal(getMatchPointsForTeam(match, 'Morocco'), 0);
    });
});

test('team points aggregate across multiple matches', () => {
    const matches = [
        {
            stage: 'Group',
            team_home: 'Spain',
            team_away: 'Morocco',
            score_home: 1,
            score_away: 1
        },
        {
            stage: 'R16',
            team_home: 'Spain',
            team_away: 'Canada',
            score_home: 2,
            score_away: 0
        }
    ];

    assert.deepEqual(buildTeamPointsMap(matches, teams), {
        Spain: 10,
        Morocco: 1,
        Canada: 0,
        Iraq: 0
    });
});

test('advancement bonus adds 1 point immediately to advanced teams', () => {
    const matches = [
        {
            stage: 'Group',
            team_home: 'Spain',
            team_away: 'Morocco',
            score_home: 1,
            score_away: 1
        }
    ];

    const advancedTeams = buildAdvancedTeamsSet([
        { team_name: 'Spain', advanced_to_knockouts: true },
        { team_name: 'Canada', advanced_to_knockouts: true },
        { team_name: 'Morocco', advanced_to_knockouts: false }
    ]);

    assert.deepEqual(buildTeamPointsMap(matches, teams, advancedTeams), {
        Spain: 2,
        Morocco: 1,
        Canada: 1,
        Iraq: 0
    });
});

test('team stage breakdown includes group slots and bonus separately', () => {
    const matches = [
        {
            id: 1,
            stage: 'Group',
            match_date_manual: '2026-06-11',
            team_home: 'Spain',
            team_away: 'Morocco',
            score_home: 2,
            score_away: 0
        },
        {
            id: 2,
            stage: 'Group',
            match_date_manual: '2026-06-15',
            team_home: 'Spain',
            team_away: 'Canada',
            score_home: 1,
            score_away: 1
        }
    ];

    const advancedTeams = buildAdvancedTeamsSet([
        { team_name: 'Spain', advanced_to_knockouts: true }
    ]);

    const breakdown = buildTeamStageBreakdownMap(matches, teams, advancedTeams);

    assert.equal(breakdown.Spain.G1, 3);
    assert.equal(breakdown.Spain.G2, 1);
    assert.equal(breakdown.Spain.G3, 0);
    assert.equal(breakdown.Spain.Bonus, 1);
    assert.equal(breakdown.Spain.total, 5);
});

test('team stage breakdown total equals the sum of each scoring bucket', () => {
    const matches = [
        { id: 1, stage: 'Group', match_date_manual: '2026-06-11', team_home: 'Spain', team_away: 'Morocco', score_home: 2, score_away: 0 },
        { id: 2, stage: 'Group', match_date_manual: '2026-06-15', team_home: 'Spain', team_away: 'Canada', score_home: 1, score_away: 1 },
        { id: 3, stage: 'R32', match_date_manual: '2026-07-01', team_home: 'Spain', team_away: 'Iraq', score_home: 1, score_away: 0 },
        { id: 4, stage: 'R16', match_date_manual: '2026-07-06', team_home: 'Spain', team_away: 'Canada', score_home: 2, score_away: 0 }
    ];

    const advancedTeams = buildAdvancedTeamsSet([
        { team_name: 'Spain', advanced_to_knockouts: true }
    ]);

    const breakdown = buildTeamStageBreakdownMap(matches, teams, advancedTeams).Spain;

    assert.equal(
        breakdown.total,
        breakdown.G1 + breakdown.G2 + breakdown.G3 + breakdown.Bonus + breakdown.R32 + breakdown.R16 + breakdown.QF + breakdown.SM + breakdown.F
    );
    assert.equal(breakdown.total, 20);
});

test('leaderboard totals score each saved squad and break ties alphabetically by nickname', () => {
    const matches = [
        {
            stage: 'Group',
            team_home: 'Spain',
            team_away: 'Morocco',
            score_home: 2,
            score_away: 0
        },
        {
            stage: 'Semis',
            team_home: 'Canada',
            team_away: 'Iraq',
            score_home: 1,
            score_away: 0
        }
    ];

    const picks = [
        { user_email: 'amy@example.com', team_name: 'Spain' },
        { user_email: 'amy@example.com', team_name: 'Canada' },
        { user_email: 'zoe@example.com', team_name: 'Spain' },
        { user_email: 'zoe@example.com', team_name: 'Canada' }
    ];

    const profilesMap = buildProfilesMap([
        { email: 'amy@example.com', nickname: 'Amy', realname: 'Amy A' },
        { email: 'zoe@example.com', nickname: 'Zoe', realname: 'Zoe Z' }
    ]);

    const advancedTeams = buildAdvancedTeamsSet([
        { team_name: 'Canada', advanced_to_knockouts: true }
    ]);

    const leaderboard = buildLeaderboardData(picks, matches, profilesMap, teams, advancedTeams);

    assert.equal(leaderboard[0].nickname, 'Amy');
    assert.equal(leaderboard[1].nickname, 'Zoe');
    assert.equal(leaderboard[0].totalPoints, 28);
    assert.equal(leaderboard[1].totalPoints, 28);
    assert.equal(leaderboard[0].stagePoints.Bonus, 1);
    assert.deepEqual(
        leaderboard[0].squad.map((team) => team.name),
        ['Spain', 'Canada']
    );
});

test('leaderboard squad carries eliminated status from team advancement rows', () => {
    const picks = [
        { user_email: 'amy@example.com', team_name: 'Spain' },
        { user_email: 'amy@example.com', team_name: 'Canada' }
    ];

    const profilesMap = buildProfilesMap([
        { email: 'amy@example.com', nickname: 'Amy', realname: 'Amy A' }
    ]);

    const leaderboard = buildLeaderboardData(
        picks,
        [],
        profilesMap,
        teams,
        new Set(),
        new Set(['Canada'])
    );

    assert.equal(leaderboard[0].squad.find((team) => team.name === 'Spain').eliminated, false);
    assert.equal(leaderboard[0].squad.find((team) => team.name === 'Canada').eliminated, true);
});

test('best available team respects budget and tier rules', () => {
    const expandedTeams = [
        { name: 'Spain', flag: '🇪🇸', cost: 50, tier: 1 },
        { name: 'France', flag: '🇫🇷', cost: 45, tier: 1 },
        { name: 'Morocco', flag: '🇲🇦', cost: 25, tier: 2 },
        { name: 'Canada', flag: '🇨🇦', cost: 10, tier: 2 },
        { name: 'Mexico', flag: '🇲🇽', cost: 25, tier: 2 },
        { name: 'Iraq', flag: '🇮🇶', cost: 4, tier: 3 },
        { name: 'Jordan', flag: '🇯🇴', cost: 2, tier: 3 },
        { name: 'Haiti', flag: '🇭🇹', cost: 2, tier: 3 },
        { name: 'Qatar', flag: '🇶🇦', cost: 4, tier: 3 }
    ];

    const matches = [
        { stage: 'Finals', team_home: 'Spain', team_away: 'France', score_home: 1, score_away: 0 },
        { stage: 'R16', team_home: 'Morocco', team_away: 'Canada', score_home: 1, score_away: 0 },
        { stage: 'Group', team_home: 'Mexico', team_away: 'Iraq', score_home: 1, score_away: 0 },
        { stage: 'Group', team_home: 'Jordan', team_away: 'Haiti', score_home: 1, score_away: 1 },
        { stage: 'Group', team_home: 'Qatar', team_away: 'Canada', score_home: 0, score_away: 0 }
    ];

    const bestTeam = buildBestAvailableTeamData(matches, expandedTeams, new Set(['Canada']), new Set(['France']));

    assert.equal(bestTeam.nickname, 'Best Available Team to Date');
    assert.equal(bestTeam.squad.length, 8);
    assert.ok(bestTeam.squad.filter((team) => team.tier === 1).length <= 1);
    assert.ok(bestTeam.squad.filter((team) => team.tier === 3).length >= 3);
    assert.ok(bestTeam.squad.reduce((sum, team) => sum + team.cost, 0) <= 150);
});
