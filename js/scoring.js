(function attachScoring(globalScope) {
    const STAGE_MULTIPLIERS = {
        Group: 1,
        R32: 2,
        R16: 3,
        Quarters: 5,
        Semis: 8,
        Finals: 12
    };

    function getMatchPointsForTeam(match, teamName) {
        const multiplier = STAGE_MULTIPLIERS[match.stage] || 1;

        if (match.score_home === match.score_away) {
            return match.team_home === teamName || match.team_away === teamName ? multiplier : 0;
        }

        const winningTeam = match.score_home > match.score_away ? match.team_home : match.team_away;
        return winningTeam === teamName ? 3 * multiplier : 0;
    }

    function buildAdvancedTeamsSet(advancementRows = []) {
        return new Set(
            (advancementRows || [])
                .filter((row) => row.advanced_to_knockouts)
                .map((row) => row.team_name)
        );
    }

    function buildEliminatedTeamsSet(advancementRows = []) {
        return new Set(
            (advancementRows || [])
                .filter((row) => row.eliminated)
                .map((row) => row.team_name)
        );
    }

    function buildTeamStageBreakdownMap(matches = [], teamsList = [], advancedTeamsSet = new Set()) {
        const knockoutStageMap = {
            R32: 'R32',
            R16: 'R16',
            Quarters: 'QF',
            Semis: 'SM',
            Finals: 'F'
        };
        const teamBreakdownMap = {};

        teamsList.forEach((team) => {
            teamBreakdownMap[team.name] = {
                G1: 0,
                G2: 0,
                G3: 0,
                Bonus: 0,
                R32: 0,
                R16: 0,
                QF: 0,
                SM: 0,
                F: 0,
                total: 0
            };
        });

        teamsList.forEach((team) => {
            const teamMatches = matches
                .filter((match) => match.team_home === team.name || match.team_away === team.name)
                .sort((a, b) => {
                    const dateCompare = (a.match_date_manual || '').localeCompare(b.match_date_manual || '');
                    if (dateCompare !== 0) {
                        return dateCompare;
                    }

                    return (a.id || 0) - (b.id || 0);
                });

            let groupIndex = 0;
            teamMatches.forEach((match) => {
                const points = getMatchPointsForTeam(match, team.name);
                if (match.stage === 'Group') {
                    groupIndex += 1;
                    const groupKey = `G${groupIndex}`;
                    if (teamBreakdownMap[team.name][groupKey] === 0) {
                        teamBreakdownMap[team.name][groupKey] = points;
                    }
                    return;
                }

                const slotKey = knockoutStageMap[match.stage];
                if (slotKey && teamBreakdownMap[team.name][slotKey] === 0) {
                    teamBreakdownMap[team.name][slotKey] = points;
                }
            });
        });

        advancedTeamsSet.forEach((teamName) => {
            if (!teamBreakdownMap[teamName]) {
                teamBreakdownMap[teamName] = {
                    G1: 0,
                    G2: 0,
                    G3: 0,
                    Bonus: 0,
                    R32: 0,
                    R16: 0,
                    QF: 0,
                    SM: 0,
                    F: 0,
                    total: 0
                };
            }

            teamBreakdownMap[teamName].Bonus = 1;
        });

        Object.values(teamBreakdownMap).forEach((breakdown) => {
            breakdown.total = breakdown.G1 + breakdown.G2 + breakdown.G3 + breakdown.Bonus + breakdown.R32 + breakdown.R16 + breakdown.QF + breakdown.SM + breakdown.F;
        });

        return teamBreakdownMap;
    }

    function buildTeamPointsMap(matches = [], teamsList = [], advancedTeamsSet = new Set()) {
        const teamBreakdownMap = buildTeamStageBreakdownMap(matches, teamsList, advancedTeamsSet);
        const teamPointsMap = {};

        Object.entries(teamBreakdownMap).forEach(([teamName, breakdown]) => {
            teamPointsMap[teamName] = breakdown.total;
        });

        return teamPointsMap;
    }

    function buildProfilesMap(profileRows = []) {
        return new Map((profileRows || []).map((profile) => [profile.email, profile]));
    }

    function getDisplayProfile(email, profilesMap, pickFallback = {}) {
        const profile = profilesMap.get(email);

        return {
            email,
            nickname: profile?.nickname || pickFallback.nickname || 'TBA',
            realname: profile?.realname || pickFallback.realname || 'Joined',
            hasPaid: typeof profile?.has_paid === 'boolean' ? profile.has_paid : Boolean(pickFallback.hasPaid),
            updatedAt: profile?.updated_at || null,
            avatarUrl: profile?.avatar_url || null,
            favoriteTeam: profile?.favorite_team || '',
            homeCountry: profile?.home_country || ''
        };
    }

    function buildLeaderboardData(allPicks = [], allMatches = [], profilesMap = new Map(), teamsList = [], advancedTeamsSet = new Set(), eliminatedTeamsSet = new Set()) {
        const teamPointsMap = buildTeamPointsMap(allMatches, teamsList, advancedTeamsSet);
        const teamBreakdownMap = buildTeamStageBreakdownMap(allMatches, teamsList, advancedTeamsSet);
        const userMap = new Map();

        allPicks.forEach((pick) => {
            if (!userMap.has(pick.user_email)) {
                const displayProfile = getDisplayProfile(pick.user_email, profilesMap, {
                    nickname: pick.team_nickname,
                    realname: pick.team_realname
                });

                userMap.set(pick.user_email, {
                    email: pick.user_email,
                    nickname: displayProfile.nickname,
                    realname: displayProfile.realname,
                    avatarUrl: displayProfile.avatarUrl,
                    favoriteTeam: displayProfile.favoriteTeam,
                    totalPoints: 0,
                    stagePoints: {
                        G1: 0,
                        G2: 0,
                        G3: 0,
                        Bonus: 0,
                        R32: 0,
                        R16: 0,
                        QF: 0,
                        SM: 0,
                        F: 0
                    },
                    squad: []
                });
            }

            const user = userMap.get(pick.user_email);
            user.totalPoints += teamPointsMap[pick.team_name] || 0;
            const teamBreakdown = teamBreakdownMap[pick.team_name];
            if (teamBreakdown) {
                user.stagePoints.G1 += teamBreakdown.G1;
                user.stagePoints.G2 += teamBreakdown.G2;
                user.stagePoints.G3 += teamBreakdown.G3;
                user.stagePoints.Bonus += teamBreakdown.Bonus;
                user.stagePoints.R32 += teamBreakdown.R32;
                user.stagePoints.R16 += teamBreakdown.R16;
                user.stagePoints.QF += teamBreakdown.QF;
                user.stagePoints.SM += teamBreakdown.SM;
                user.stagePoints.F += teamBreakdown.F;
            }

            const teamData = teamsList.find((team) => team.name === pick.team_name);
            if (teamData) {
                user.squad.push({
                    name: teamData.name,
                    flag: teamData.flag,
                    cost: teamData.cost,
                    tier: teamData.tier,
                    eliminated: eliminatedTeamsSet.has(teamData.name)
                });
            }
        });

        return Array.from(userMap.values()).sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) {
                return b.totalPoints - a.totalPoints;
            }

            return a.nickname.localeCompare(b.nickname);
        });
    }

    function compareBestCandidates(nextCandidate, currentCandidate) {
        if (!currentCandidate) {
            return true;
        }

        if (nextCandidate.totalPoints !== currentCandidate.totalPoints) {
            return nextCandidate.totalPoints > currentCandidate.totalPoints;
        }

        if (nextCandidate.totalCost !== currentCandidate.totalCost) {
            return nextCandidate.totalCost < currentCandidate.totalCost;
        }

        const nextNames = nextCandidate.squad.map((team) => team.name).sort().join('|');
        const currentNames = currentCandidate.squad.map((team) => team.name).sort().join('|');
        return nextNames < currentNames;
    }

    function buildBestAvailableTeamData(allMatches = [], teamsList = [], advancedTeamsSet = new Set(), eliminatedTeamsSet = new Set()) {
        const teamPointsMap = buildTeamPointsMap(allMatches, teamsList, advancedTeamsSet);
        const teamBreakdownMap = buildTeamStageBreakdownMap(allMatches, teamsList, advancedTeamsSet);
        const emptyStagePoints = () => ({
            G1: 0,
            G2: 0,
            G3: 0,
            Bonus: 0,
            R32: 0,
            R16: 0,
            QF: 0,
            SM: 0,
            F: 0
        });

        let states = new Map([
            ['0|0|0|0', {
                totalPoints: 0,
                totalCost: 0,
                squad: [],
                stagePoints: emptyStagePoints()
            }]
        ]);

        teamsList.forEach((team) => {
            const nextStates = new Map(states);
            const teamPoints = teamPointsMap[team.name] || 0;
            const teamBreakdown = teamBreakdownMap[team.name] || emptyStagePoints();
            const teamTierOneIncrement = team.tier === 1 ? 1 : 0;
            const teamTierThreeIncrement = team.tier === 3 ? 1 : 0;

            states.forEach((state, key) => {
                const [count, cost, tierOneCount, tierThreeBucket] = key.split('|').map(Number);
                if (count >= 8) {
                    return;
                }

                const nextCost = cost + team.cost;
                if (nextCost > 150) {
                    return;
                }

                const nextTierOneCount = tierOneCount + teamTierOneIncrement;
                if (nextTierOneCount > 1) {
                    return;
                }

                const nextCount = count + 1;
                const nextTierThreeBucket = Math.min(3, tierThreeBucket + teamTierThreeIncrement);
                const nextKey = `${nextCount}|${nextCost}|${nextTierOneCount}|${nextTierThreeBucket}`;
                const nextCandidate = {
                    totalPoints: state.totalPoints + teamPoints,
                    totalCost: nextCost,
                    squad: [...state.squad, {
                        name: team.name,
                        flag: team.flag,
                        cost: team.cost,
                        tier: team.tier,
                        eliminated: eliminatedTeamsSet.has(team.name)
                    }],
                    stagePoints: {
                        G1: state.stagePoints.G1 + teamBreakdown.G1,
                        G2: state.stagePoints.G2 + teamBreakdown.G2,
                        G3: state.stagePoints.G3 + teamBreakdown.G3,
                        Bonus: state.stagePoints.Bonus + teamBreakdown.Bonus,
                        R32: state.stagePoints.R32 + teamBreakdown.R32,
                        R16: state.stagePoints.R16 + teamBreakdown.R16,
                        QF: state.stagePoints.QF + teamBreakdown.QF,
                        SM: state.stagePoints.SM + teamBreakdown.SM,
                        F: state.stagePoints.F + teamBreakdown.F
                    }
                };

                const existingCandidate = nextStates.get(nextKey);
                if (compareBestCandidates(nextCandidate, existingCandidate)) {
                    nextStates.set(nextKey, nextCandidate);
                }
            });

            states = nextStates;
        });

        let bestCandidate = null;
        states.forEach((candidate, key) => {
            const [count, , tierOneCount, tierThreeBucket] = key.split('|').map(Number);
            if (count !== 8 || tierOneCount > 1 || tierThreeBucket < 3) {
                return;
            }

            if (compareBestCandidates(candidate, bestCandidate)) {
                bestCandidate = candidate;
            }
        });

        if (!bestCandidate) {
            return null;
        }

        return {
            email: 'best-available-team',
            nickname: 'Best Available Team to Date',
            realname: 'Highest-scoring legal squad so far',
            totalPoints: bestCandidate.totalPoints,
            stagePoints: bestCandidate.stagePoints,
            squad: bestCandidate.squad
        };
    }

    const api = {
        STAGE_MULTIPLIERS,
        getMatchPointsForTeam,
        buildAdvancedTeamsSet,
        buildEliminatedTeamsSet,
        buildTeamStageBreakdownMap,
        buildTeamPointsMap,
        buildProfilesMap,
        getDisplayProfile,
        buildLeaderboardData,
        buildBestAvailableTeamData
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    globalScope.WorldCupScoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
