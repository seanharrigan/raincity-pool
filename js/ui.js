// Tracks the ? button state so we know when to re-flash on regression
let _picksHelperState = 'neutral'; // 'neutral' | 'warn' | 'success'
let _picksHelperAnimId = 0; // incremented on every new animation so stale listeners self-cancel

// Always keep an inner <span> for the label so we can fade text independently
function _phSpan(btn) {
    let span = btn.querySelector('span.ph-label');
    if (!span) {
        const current = btn.textContent;
        btn.textContent = '';
        span = document.createElement('span');
        span.className = 'ph-label';
        span.style.cssText = 'display:inline-block; transition: opacity 0.28s ease; pointer-events:none;';
        span.textContent = current;
        btn.appendChild(span);
    }
    return span;
}

function _phSetText(btn, text) {
    _phSpan(btn).textContent = text;
}

function _phFadeText(btn, newText, animId, callback) {
    const span = _phSpan(btn);
    span.style.opacity = '0';
    setTimeout(() => {
        if (_picksHelperAnimId !== animId) return; // interrupted — bail
        span.textContent = newText;
        span.style.opacity = '1';
        if (callback) setTimeout(() => { if (_picksHelperAnimId === animId) callback(); }, 300);
    }, 290);
}

function triggerPicksHelperFlash(btn) {
    const animId = ++_picksHelperAnimId;
    _phSetText(btn, '?');
    btn.classList.remove('picks-helper-warn', 'picks-helper-success', 'picks-helper-success-flash', 'picks-helper-flash');
    void btn.offsetWidth; // reflow to restart animation
    btn.classList.add('picks-helper-flash');
    btn.addEventListener('animationend', function onEnd() {
        if (_picksHelperAnimId !== animId) return; // stale — a newer animation took over
        btn.classList.remove('picks-helper-flash');
        if (_picksHelperState === 'warn') btn.classList.add('picks-helper-warn');
        else if (_picksHelperState === 'success') btn.classList.add('picks-helper-success');
    }, { once: true });
}

function triggerPicksHelperSuccess(btn) {
    const animId = ++_picksHelperAnimId;
    _phSetText(btn, '✓');
    btn.classList.remove('picks-helper-warn', 'picks-helper-success', 'picks-helper-flash', 'picks-helper-success-flash');
    void btn.offsetWidth;
    btn.classList.add('picks-helper-success-flash');
    btn.addEventListener('animationend', function onEnd() {
        if (_picksHelperAnimId !== animId) return; // stale
        btn.classList.remove('picks-helper-success-flash');
        // Fade only the label ✓ → ? while the circle stays fully visible
        _phFadeText(btn, '?', animId, () => {
            btn.classList.add('picks-helper-success');
        });
    }, { once: true });
}

function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');

    if (!container) {
        return;
    }

    const toast = document.createElement('div');
    const palette = type === 'success'
        ? 'bg-green-600 border-green-500 text-white'
        : 'bg-red-600 border-red-500 text-white';

    toast.className = `animate-bounce-in rounded-2xl border px-4 py-3 font-black uppercase tracking-wider shadow-2xl ${palette}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2800);
}

let mobilePicksHelperAnchorTimeout = null;

function attachAlphaJumpToSelect(select) {
    if (!select || select.dataset.alphaJumpBound === 'true') {
        return;
    }

    select.addEventListener('keydown', (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
            return;
        }

        const letter = event.key.toLowerCase();
        if (!/[a-z]/.test(letter)) {
            return;
        }

        const options = Array.from(select.options);
        const currentIndex = Math.max(select.selectedIndex, 0);
        const matcher = (option) => (option.value || option.textContent || '').trim().toLowerCase().startsWith(letter);
        const nextIndex = options.findIndex((option, index) => index > currentIndex && matcher(option));
        const fallbackIndex = options.findIndex((option) => matcher(option));
        const targetIndex = nextIndex >= 0 ? nextIndex : fallbackIndex;

        if (targetIndex <= 0) {
            return;
        }

        event.preventDefault();
        select.selectedIndex = targetIndex;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    select.dataset.alphaJumpBound = 'true';
}

function showConfirmModal({
    label = 'Confirm Email',
    icon = '✉️',
    title = 'Are you sure?',
    message = '',
    detail = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    singleAction = false
}) {
    const modal = document.getElementById('confirm-modal');
    const iconEl = document.getElementById('confirm-modal-icon');
    const labelEl = document.getElementById('confirm-modal-label');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const detailEl = document.getElementById('confirm-modal-detail');
    const confirmButton = document.getElementById('confirm-modal-confirm');
    const cancelButton = document.getElementById('confirm-modal-cancel');

    if (!modal || !iconEl || !labelEl || !titleEl || !messageEl || !detailEl || !confirmButton || !cancelButton) {
        return Promise.resolve(window.confirm(message));
    }

    iconEl.textContent = icon;
    labelEl.textContent = label;
    titleEl.textContent = title;
    messageEl.textContent = message;
    detailEl.textContent = detail;
    confirmButton.textContent = confirmText;
    cancelButton.textContent = cancelText;
    cancelButton.classList.toggle('hidden', singleAction);
    confirmButton.classList.toggle('flex-1', !singleAction);
    confirmButton.classList.toggle('w-full', singleAction);

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    return new Promise((resolve) => {
        const cleanup = (result) => {
            const card = modal.querySelector('.modal-card');
            const finish = () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                if (card) card.classList.remove('modal-exiting');
                cancelButton.classList.remove('hidden');
                confirmButton.classList.remove('w-full');
                confirmButton.classList.add('flex-1');
                confirmButton.removeEventListener('click', handleConfirm);
                cancelButton.removeEventListener('click', handleCancel);
                modal.removeEventListener('click', handleBackdrop);
                document.removeEventListener('keydown', handleEscape);
                resolve(result);
            };
            if (card) {
                card.classList.add('modal-exiting');
                card.addEventListener('animationend', finish, { once: true });
            } else {
                finish();
            }
        };

        const handleConfirm = () => cleanup(true);
        const handleCancel = () => cleanup(false);
        const handleBackdrop = (event) => {
            if (event.target === modal) {
                cleanup(false);
            }
        };
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                cleanup(false);
            }
        };

        confirmButton.addEventListener('click', handleConfirm);
        cancelButton.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleBackdrop);
        document.addEventListener('keydown', handleEscape);
    });
}

function showSimulationStageModal(defaultValue = 'Finals') {
    const modal = document.getElementById('simulation-stage-modal');
    const selectEl = document.getElementById('simulation-stage-select');
    const confirmButton = document.getElementById('simulation-stage-confirm');
    const cancelButton = document.getElementById('simulation-stage-cancel');

    if (!modal || !selectEl || !confirmButton || !cancelButton) {
        return Promise.resolve(defaultValue);
    }

    selectEl.value = defaultValue;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    return new Promise((resolve) => {
        const cleanup = (result) => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            confirmButton.removeEventListener('click', handleConfirm);
            cancelButton.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleBackdrop);
            document.removeEventListener('keydown', handleEscape);
            resolve(result);
        };

        const handleConfirm = () => cleanup(selectEl.value);
        const handleCancel = () => cleanup(null);
        const handleBackdrop = (event) => {
            if (event.target === modal) cleanup(null);
        };
        const handleEscape = (event) => {
            if (event.key === 'Escape') cleanup(null);
        };

        confirmButton.addEventListener('click', handleConfirm);
        cancelButton.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleBackdrop);
        document.addEventListener('keydown', handleEscape);
        selectEl.focus();
    });
}

function showProfileSetupModal(email, defaults = {}) {
    const modal = document.getElementById('profile-setup-modal');
    const messageEl = document.getElementById('profile-setup-message');
    const submessageEl = document.getElementById('profile-setup-submessage');
    const poolPasswordInput = document.getElementById('profile-setup-pool-password');
    const nicknameInput = document.getElementById('profile-setup-nickname');
    const realnameInput = document.getElementById('profile-setup-realname');
    const favoriteTeamInput = document.getElementById('profile-setup-favorite-team');
    const homeCountryInput = document.getElementById('profile-setup-home-country');
    const confirmButton = document.getElementById('profile-setup-confirm');
    const cancelButton = document.getElementById('profile-setup-cancel');

    if (!modal || !messageEl || !submessageEl || !poolPasswordInput || !nicknameInput || !realnameInput || !favoriteTeamInput || !homeCountryInput || !confirmButton || !cancelButton) {
        return Promise.resolve(null);
    }

    if (favoriteTeamInput.dataset.optionsLoaded !== 'true') {
        const options = [...teams]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((team) => `<option value="${team.name}">${team.flag} ${team.name}</option>`)
            .join('');

        favoriteTeamInput.insertAdjacentHTML('beforeend', options);
        homeCountryInput.insertAdjacentHTML('beforeend', options);
        favoriteTeamInput.dataset.optionsLoaded = 'true';
        homeCountryInput.dataset.optionsLoaded = 'true';
    }

    attachAlphaJumpToSelect(favoriteTeamInput);
    attachAlphaJumpToSelect(homeCountryInput);

    const isPreview = Boolean(defaults.preview);
    if (isPreview) {
        messageEl.textContent = 'Preview mode — this is exactly what new users see when signing up.';
        submessageEl.textContent = 'Click Continue to close. Avatar uploads land in a separate preview file, so your real avatar is untouched.';
    } else {
        messageEl.textContent = `You're creating a new profile for ${email}.`;
        submessageEl.textContent = 'Enter the shared pool password once, then set your pool identity.';
    }
    poolPasswordInput.value = '';
    nicknameInput.value = defaults.nickname || '';
    realnameInput.value = defaults.realname || '';
    favoriteTeamInput.value = defaults.favoriteTeam || '';
    homeCountryInput.value = defaults.homeCountry || '';

    const avatarPreviewEl = document.getElementById('profile-setup-avatar-preview');
    const fileInput = document.getElementById('profile-setup-file-input');
    const uploadBtn = document.getElementById('profile-setup-upload-btn');
    const useGoogleBtn = document.getElementById('profile-setup-use-google-btn');
    const avatarStatusEl = document.getElementById('profile-setup-avatar-status');
    const googleAvatarUrl = defaults.googleAvatarUrl || '';
    let currentAvatarUrl = defaults.avatarUrl || googleAvatarUrl || '';

    const renderAvatarPreview = () => {
        if (avatarPreviewEl && typeof _renderPlayerAvatar === 'function') {
            avatarPreviewEl.innerHTML = _renderPlayerAvatar(currentAvatarUrl, favoriteTeamInput.value, 64, nicknameInput.value);
        }
        if (useGoogleBtn) {
            useGoogleBtn.classList.toggle('hidden', !googleAvatarUrl || currentAvatarUrl === googleAvatarUrl);
        }
    };
    renderAvatarPreview();

    const handleNicknameInput = () => renderAvatarPreview();
    const handleFavoriteChange = () => renderAvatarPreview();
    const handleUploadClick = () => fileInput?.click();
    const handleUseGoogleClick = () => {
        currentAvatarUrl = googleAvatarUrl;
        if (avatarStatusEl) avatarStatusEl.textContent = 'Using Google photo';
        renderAvatarPreview();
    };
    const handleFileChange = async (event) => {
        const file = event.target?.files?.[0];
        if (!file) return;
        try {
            const url = await pickAndUploadAvatar(file, email, isPreview ? 'preview-avatar.jpg' : 'avatar.jpg', favoriteTeamInput.value);
            if (!url) {
                if (avatarStatusEl) avatarStatusEl.textContent = '';
                return;
            }
            currentAvatarUrl = url;
            if (avatarStatusEl) avatarStatusEl.textContent = 'Ready ✓';
            renderAvatarPreview();
        } catch (err) {
            if (avatarStatusEl) avatarStatusEl.textContent = err.message || 'Upload failed';
        } finally {
            event.target.value = '';
        }
    };

    nicknameInput.addEventListener('input', handleNicknameInput);
    favoriteTeamInput.addEventListener('change', handleFavoriteChange);
    uploadBtn?.addEventListener('click', handleUploadClick);
    useGoogleBtn?.addEventListener('click', handleUseGoogleClick);
    fileInput?.addEventListener('change', handleFileChange);

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    return new Promise((resolve) => {
        const cleanup = (result) => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            confirmButton.removeEventListener('click', handleConfirm);
            cancelButton.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleBackdrop);
            document.removeEventListener('keydown', handleEscape);
            nicknameInput.removeEventListener('keydown', handleEnter);
            realnameInput.removeEventListener('keydown', handleEnter);
            favoriteTeamInput.removeEventListener('keydown', handleEnter);
            homeCountryInput.removeEventListener('keydown', handleEnter);
            poolPasswordInput.removeEventListener('keydown', handleEnter);
            nicknameInput.removeEventListener('input', handleNicknameInput);
            favoriteTeamInput.removeEventListener('change', handleFavoriteChange);
            uploadBtn?.removeEventListener('click', handleUploadClick);
            useGoogleBtn?.removeEventListener('click', handleUseGoogleClick);
            fileInput?.removeEventListener('change', handleFileChange);
            resolve(result);
        };

        const submitIfValid = () => {
            const poolPassword = poolPasswordInput.value.trim();
            const nickname = nicknameInput.value.trim();
            const realname = realnameInput.value.trim();
            const favoriteTeam = favoriteTeamInput.value;
            const homeCountry = homeCountryInput.value;

            if (!poolPassword) {
                showToast('Enter the pool password.');
                return;
            }

            if (!nickname || !realname) {
                showToast('Enter nickname and real name.');
                return;
            }

            cleanup({ poolPassword, nickname, realname, favoriteTeam, homeCountry, avatarUrl: currentAvatarUrl });
        };

        const handleConfirm = () => submitIfValid();
        const handleCancel = () => cleanup(null);
        const handleBackdrop = (event) => {
            if (event.target === modal) {
                cleanup(null);
            }
        };
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                cleanup(null);
            }
        };
        const handleEnter = (event) => {
            if (event.key !== 'Enter') {
                return;
            }

            event.preventDefault();
            submitIfValid();
        };

        confirmButton.addEventListener('click', handleConfirm);
        cancelButton.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleBackdrop);
        document.addEventListener('keydown', handleEscape);
        nicknameInput.addEventListener('keydown', handleEnter);
        realnameInput.addEventListener('keydown', handleEnter);
        favoriteTeamInput.addEventListener('keydown', handleEnter);
        homeCountryInput.addEventListener('keydown', handleEnter);
        poolPasswordInput.addEventListener('keydown', handleEnter);
        setTimeout(() => poolPasswordInput.focus(), 0);
    });
}

function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach((page) => {
        page.classList.add('hidden');
        page.hidden = true;
    });
    document.querySelectorAll('.nav-link').forEach((link) => link.classList.remove('active'));
    const mobileMenu = document.getElementById('mobile-menu');
    const wasMobileMenuOpen = mobileMenu?.classList.contains('open');
    mobileMenu?.classList.remove('open');

    const section = document.getElementById(`page-${pageId}`);
    if (section) {
        section.classList.remove('hidden');
        section.hidden = false;
    }

    const navLinks = document.querySelectorAll(`[id^='nav-${pageId}']`);
    navLinks.forEach((link) => link.classList.add('active'));

    if (pageId === 'instructions') setupDashboard();
    if (pageId === 'results') {
        const resultsContent = document.querySelector('#page-results .overflow-y-auto');
        if (resultsContent) resultsContent.scrollTop = 0;
    }
    if (pageId !== 'picks') {
        togglePicksRulesBar(false); // close modal if open when leaving picks page
    }

    if (pageId === 'picks') {
        // Reset so updateUI picks the right entry animation fresh
        _picksHelperState = 'neutral';
        updateUI();
        syncMobileRosterState();
        // If squad is incomplete, fire the yellow entry flash (success path is handled by updateUI)
        const helperBtn = document.getElementById('picks-rules-toggle');
        if (helperBtn && _picksHelperState === 'warn') triggerPicksHelperFlash(helperBtn);
        // Mobile hint: nudge the My Squad handle twice so users know it's there
        if (window.innerWidth < 768) {
            const nudgeRoster = () => {
                const panel = document.getElementById('roster-panel');
                if (!panel || !panel.classList.contains('roster-minimized')) return;
                panel.classList.remove('roster-nudge');
                void panel.offsetWidth;
                panel.classList.add('roster-nudge');
                panel.addEventListener('animationend', () => panel.classList.remove('roster-nudge'), { once: true });
            };
            setTimeout(nudgeRoster, 800);
            setTimeout(nudgeRoster, 5800);
        }
    }
    if (pageId === 'leaderboard') fetchLeaderboard();
    if (pageId === 'admin') setupAdminPage();
    if (pageId === 'chat') setupChat();
    if (pageId === 'profile') setupProfile();
    if (pageId === 'results') setupResultsPage();
    if (pageId === 'stats') setupStatsPage();

    if (section) {
        requestAnimationFrame(() => {
            section.scrollTop = 0;
            section.querySelectorAll('*').forEach((node) => {
                const element = node;
                if (element instanceof HTMLElement && element.scrollTop > 0) {
                    element.scrollTop = 0;
                }
            });
            window.scrollTo(0, 0);

        });
    }
}

function toggleMobileMenu() {
    document.getElementById('mobile-menu').classList.toggle('open');
}

function toggleMobileRoster() {
    const panel = document.getElementById('roster-panel');
    const arrow = document.getElementById('roster-arrow');
    const helper = document.getElementById('roster-helper');
    const quickSave = document.getElementById('mobile-quick-save');
    const isMinimized = panel.classList.toggle('roster-minimized');
    arrow.innerText = isMinimized ? '▲' : '▼';
    if (helper) {
        helper.textContent = isMinimized ? 'Click to view' : 'Click to close';
    }
    if (quickSave) {
        quickSave.classList.toggle('hidden', !isMinimized);
    }
}

function togglePicksRulesBar(forceExpanded = null) {
    const modal = document.getElementById('picks-helper-modal');
    if (!modal) return;

    const isHidden = modal.classList.contains('hidden');
    const shouldExpand = forceExpanded === null ? isHidden : forceExpanded;

    if (shouldExpand) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.remove('picks-modal-out')));
        const onEscape = (e) => {
            if (e.key === 'Escape') { togglePicksRulesBar(false); document.removeEventListener('keydown', onEscape); }
        };
        document.addEventListener('keydown', onEscape);
    } else {
        modal.classList.add('picks-modal-out');
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 280);
    }
}

// No-ops kept for any lingering call sites — anchor logic replaced by fixed-position button
function updatePicksRulesHelpAnchor() {}
function resetMobilePicksRulesHelpAnchor() {}

function syncMobileRosterState() {
    const panel = document.getElementById('roster-panel');
    const arrow = document.getElementById('roster-arrow');
    const helper = document.getElementById('roster-helper');

    if (!panel || !arrow) {
        return;
    }

    if (window.innerWidth < 768) {
        panel.classList.add('roster-minimized');
        arrow.innerText = '▲';
        if (helper) {
            helper.textContent = 'Click to view';
        }
    } else {
        panel.classList.remove('roster-minimized');
        arrow.innerText = '▼';
        if (helper) {
            helper.textContent = '';
        }
    }

    updatePicksRulesHelpAnchor(true);
}

function renderPool() {
    const container = document.getElementById('tiers-container');
    container.innerHTML = '';

    [1, 2, 3].forEach((tierNum) => {
        const tierTeams = teams.filter((team) => team.tier === tierNum);

        const section = document.createElement('div');
        section.innerHTML = `
            <div class="flex items-center gap-4 mb-4 text-left">
                <div class="picks-tier-label px-3 py-1 font-black italic text-xs tracking-widest uppercase text-left">
                    Tier ${tierNum}
                </div>
                <div class="h-px bg-gray-200 flex-grow"></div>
            </div>
            <div class="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3 text-left text-gray-900">
                ${tierTeams.map((team) => `
                    <div
                        onclick="toggleTeam('${team.name}')"
                        id="pool-${team.name.replace(/\s/g, '')}"
                        class="team-card bg-white border-2 border-gray-100 rounded-2xl p-2 shadow-sm ${isLocked ? 'locked-ui' : ''} text-gray-900 text-left"
                    >
                        <div class="flex justify-between items-start text-left mb-1 text-gray-900">
                            <span class="text-[22px] md:text-3xl text-left">${team.flag}</span>
                            <span class="picks-price-pill font-bold px-1.5 py-0.5 rounded text-[9px] md:text-xs text-left">$${team.cost}</span>
                        </div>
                        <div class="flex justify-between items-baseline gap-1">
                            <div class="font-black uppercase text-[8px] md:text-[10px] tracking-tight truncate text-gray-900">${team.name}</div>
                            ${team.group ? `<div class="text-[8px] italic text-gray-400 shrink-0">Grp ${team.group}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(section);
    });

    if (typeof window.applyPicksAccentTheme === 'function') {
        window.applyPicksAccentTheme(window.getCurrentProfileIdentity?.() || null);
    }

    syncMobileRosterState();
}

function updateUI() {
    let spent = 0;

    document.querySelectorAll('.team-card').forEach((element) => element.classList.remove('selected'));

    const list = document.getElementById('roster-list');
    if (!list) {
        return;
    }

    list.innerHTML = '';

    myPicks
        .sort((a, b) => b.cost - a.cost)
        .forEach((team) => {
            spent += team.cost;

            const poolElement = document.getElementById(`pool-${team.name.replace(/\s/g, '')}`);
            if (poolElement) {
                poolElement.classList.add('selected');
            }

            const item = document.createElement('div');
            item.className = 'flex items-center justify-between self-start bg-gray-800 p-2 md:p-3 rounded-xl border border-gray-700 text-left text-white min-w-0 md:w-full';
            item.innerHTML = `
                <div class="flex items-center gap-1.5 md:gap-2 text-left text-white min-w-0">
                    <span class="text-lg md:text-xl text-left text-white">${team.flag}</span>
                    <div class="text-[8px] md:text-[9px] font-black uppercase tracking-[0.12em] truncate text-left text-white">${team.name}</div>
                </div>
                <div class="flex items-center gap-1.5 md:gap-2 text-white text-left">
                    <span class="text-green-400 font-mono font-bold text-[10px] md:text-xs text-left">$${team.cost}</span>
                    ${!isLocked ? `<button onclick="toggleTeam('${team.name}')" class="text-gray-500 hover:text-white text-lg font-bold text-left text-white text-center">×</button>` : ''}
                </div>
            `;
            list.appendChild(item);
        });

    const remaining = 150 - spent;
    const display = document.getElementById('budget-display');
    display.innerText = `$${remaining}`;
    display.className = remaining < 0
        ? 'text-xl md:text-2xl font-mono font-bold text-red-500 text-left'
        : 'text-xl md:text-2xl font-mono font-bold text-green-400 text-left';

    document.getElementById('roster-count').innerText = `${myPicks.length} teams`;

    const hasStarted = myPicks.length > 0;
    const tier1Count = myPicks.filter((team) => team.tier === 1).length;
    const tier2Count = myPicks.filter((team) => team.tier === 2).length;
    const tier3Count = myPicks.filter((team) => team.tier === 3).length;

    const setRuleChipState = (id, state, helperText, iconText) => {
        const chip = document.getElementById(id);
        const helper = document.getElementById(`${id}-helper`);
        const icon = document.getElementById(`${id}-icon`);
        if (!chip) return;

        // Reset to dark-card neutral
        chip.style.borderColor = '#374151';
        chip.style.backgroundColor = '#1f2937';

        if (helper) { helper.textContent = helperText; helper.style.color = '#9ca3af'; }
        if (icon) { icon.textContent = iconText; icon.style.color = '#9ca3af'; }

        if (state === 'success') {
            chip.style.borderColor = '#166534';
            chip.style.backgroundColor = '#14532d22';
            if (icon) icon.style.color = '#4ade80';
            return;
        }
        if (state === 'warning') {
            chip.style.borderColor = '#92400e';
            chip.style.backgroundColor = '#78350f22';
            if (icon) icon.style.color = '#fbbf24';
            return;
        }
        if (state === 'error') {
            chip.style.borderColor = '#991b1b';
            chip.style.backgroundColor = '#7f1d1d22';
            if (icon) icon.style.color = '#f87171';
            return;
        }
    };

    // Update budget progress bar and spent amount
    const budgetBar = document.getElementById('rule-chip-budget-bar');
    const budgetSpent = document.getElementById('rule-chip-budget-spent');
    if (budgetBar) {
        const pct = Math.min(100, Math.round((spent / 150) * 100));
        budgetBar.style.width = `${pct}%`;
        const barColor = remaining < 0 ? '#f87171' : remaining < 10 ? '#4ade80' : 'var(--theme-accent-primary)';
        budgetBar.style.backgroundColor = barColor;
    }
    if (budgetSpent) budgetSpent.textContent = `$${spent}`;

    let budgetState = 'neutral';
    if (hasStarted) {
        if (remaining < 0) {
            budgetState = 'error';
        } else if (remaining < 2) {
            budgetState = 'success';
        } else {
            budgetState = 'warning';
        }
    }

    const budgetHelper = remaining < 0 ? 'Over budget' : remaining === 0 ? 'At budget' : 'Under budget';
    const budgetIcon = remaining < 0 ? '✕' : remaining === 0 ? '✓' : '~';

    const tier1State = hasStarted ? 'success' : 'neutral';
    const tier2State = tier2Count > 0 ? 'success' : 'neutral';
    const tier3Needed = Math.max(0, 3 - tier3Count);
    const tier3State = !hasStarted ? 'neutral' : tier3Count >= 3 ? 'success' : tier3Count === 2 ? 'warning' : 'error';
    const tier3Helper = tier3Count >= 3 ? 'Complete' : `Pick ${tier3Needed} more`;
    const tier3Icon = tier3Count >= 3 ? '✓' : tier3Count === 2 ? '~' : '✕';

    setRuleChipState('rule-chip-budget', budgetState, budgetHelper, budgetIcon);
    setRuleChipState('rule-chip-tier1', tier1State, 'Complete', '✓');
    setRuleChipState('rule-chip-tier2', tier2State, 'Complete', '✓');
    setRuleChipState('rule-chip-tier3', tier3State, tier3Helper, tier3Icon);

    // Update ? button state immediately — no guards, interrupts any in-progress animation
    const helperToggle = document.getElementById('picks-rules-toggle');
    if (helperToggle) {
        const allMet = myPicks.length === 8 && remaining >= 0 && remaining < 2 && tier1Count <= 1 && tier3Count >= 3;
        const hasAny = myPicks.length > 0;
        const newState = allMet ? 'success' : hasAny ? 'warn' : 'neutral';

        if (newState !== _picksHelperState) {
            if (newState === 'success') {
                triggerPicksHelperSuccess(helperToggle);
            } else if (newState === 'warn') {
                // Flash yellow on any transition into warn (regression or mid-bounce correction)
                triggerPicksHelperFlash(helperToggle);
            } else {
                // neutral — no picks yet
                ++_picksHelperAnimId; // cancel any pending animation callbacks
                helperToggle.classList.remove('picks-helper-warn', 'picks-helper-success', 'picks-helper-flash', 'picks-helper-success-flash');
                _phSetText(helperToggle, '?');
            }
            _picksHelperState = newState;
        }
    }
}

async function renderGroups() {
    const container = document.getElementById('groups-grid');
    if (!container) {
        return;
    }

    container.innerHTML = '<div class="col-span-full rounded-2xl border border-gray-100 bg-white p-8 text-center text-xs font-black uppercase tracking-[0.3em] text-gray-400">Loading group standings...</div>';

    let matches = [];

    try {
        const { data, error } = await supabaseClient
            .from('matches')
            .select('*')
            .order('match_date_manual', { ascending: true });

        if (error) {
            throw error;
        }

        matches = data || [];
    } catch (error) {
        matches = [];
    }

    container.innerHTML = '';
    const standingsByGroup = computeGroupStandings(matches);
    const bestThirdPlaceTeams = _getBestThirdPlaceTeams(standingsByGroup).slice(0, 8);
    const advancingTeams = new Set();

    Object.values(standingsByGroup).forEach((groupStanding) => {
        (groupStanding?.teams || []).slice(0, 2).forEach((team) => advancingTeams.add(team.name));
    });
    bestThirdPlaceTeams.forEach((team) => advancingTeams.add(team.name));

    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach((group) => {
        const groupStanding = standingsByGroup[group];
        const groupTeams = (groupStanding?.teams || []).map((team, index) => {
            const teamMeta = teams.find((entry) => entry.name === team.name) || { flag: '🏳', cost: 0, tier: '-' };
            const seedLabel = `${index + 1}${group}`;
            return {
                ...teamMeta,
                ...team,
                seedLabel,
                isAdvancing: advancingTeams.has(team.name)
            };
        });
        const groupStatusLabel = groupStanding?.status === 'complete'
            ? 'Complete'
            : 'In Progress';
        const dividerIndex = groupTeams.findIndex((team) => !team.isAdvancing);

        const card = document.createElement('div');
        card.className = 'bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-gray-900 text-left';
        card.innerHTML = `
            <div class="mb-4 border-b border-gray-100 pb-3">
                <div class="flex items-center justify-between gap-3">
                    <h3 class="font-black italic text-xl text-left text-gray-900">GROUP ${group}</h3>
                    <div class="rounded-full bg-gray-100 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">${groupStatusLabel}</div>
                </div>
                <div class="mt-3 grid grid-cols-[minmax(0,1fr)_52px] gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">
                    <div>Team</div>
                    <div class="text-right">Pts</div>
                </div>
            </div>
            ${groupTeams.map((team) => `
                <div onclick="showTeamOwners('${team.name.replace(/'/g, "\\'")}')" class="theme-hover-row cursor-pointer -mx-3 px-3 flex items-center justify-between gap-3 py-2.5 transition-colors ${team.isAdvancing ? 'bg-emerald-50/80' : ''} ${(dividerIndex > 0 && groupTeams[dividerIndex - 1]?.name === team.name) ? 'border-b-2 border-emerald-200' : 'border-b border-gray-50'} last:border-0 text-left text-gray-900">
                    <div class="flex min-w-0 flex-1 items-center gap-3">
                        <div class="w-10 shrink-0 text-center">
                            <div class="text-2xl leading-none">${team.flag}</div>
                            <div class="mt-1 text-[9px] font-black uppercase tracking-[0.18em] ${team.isAdvancing ? 'text-emerald-500' : 'text-gray-400'}">${team.seedLabel}</div>
                        </div>
                        <div class="min-w-0">
                            <div class="font-bold text-sm text-left text-gray-900">${team.name} <span class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">(${team.gd > 0 ? `+${team.gd}` : team.gd})</span></div>
                            <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 text-left">${team.played} played</div>
                        </div>
                    </div>
                    <div class="w-12 shrink-0 text-right">
                        <div class="text-sm font-black italic leading-none text-gray-900">${team.pts}</div>
                        <div class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">Pts</div>
                    </div>
                </div>
            `).join('')}
        `;
        container.appendChild(card);
    });
}

const TOURNAMENT_PHASES = [
    { label: 'Kick Off',       date: LOCK_DATE },
    { label: 'Round of 32',    date: new Date('2026-07-04T12:00:00') },
    { label: 'Round of 16',    date: new Date('2026-07-11T12:00:00') },
    { label: 'Quarter Finals', date: new Date('2026-07-17T12:00:00') },
    { label: 'Semi Finals',    date: new Date('2026-07-22T12:00:00') },
    { label: 'The Final',      date: new Date('2026-07-26T15:00:00') },
];

function _getActivePhase() {
    const now = new Date();
    for (let i = 0; i < TOURNAMENT_PHASES.length; i++) {
        if (now < TOURNAMENT_PHASES[i].date) return TOURNAMENT_PHASES[i];
    }
    return null;
}

function _formatCountdownCompact(distance) {
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function startCountdown() {
    if (countdownStarted) {
        return;
    }

    countdownStarted = true;

    const updateCountdownDisplays = async () => {
        const distance = LOCK_DATE.getTime() - new Date().getTime();

        if (distance <= 0 && !kickoffLockSyncAttempted) {
            kickoffLockSyncAttempted = true;
            if (appSettings.autoLockAtKickoff) {
                appSettings.picksLocked = true;
                try {
                    await saveAppSettings({
                        picksLocked: true,
                        autoLockAtKickoff: appSettings.autoLockAtKickoff
                    });
                } catch (error) {
                    // Keep local lock even if remote persistence fails.
                }
            }
            refreshLockState();
            renderPool();
            updateUI();
        }

        // Legacy picks-page countdown (remove once kicked off)
        if (distance > 0) {
            const days = Math.floor(distance / (1000 * 60 * 60 * 24)).toString().padStart(2, '0');
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)).toString().padStart(2, '0');
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
            if (document.getElementById('days')) {
                document.getElementById('days').innerText = days;
                document.getElementById('hours').innerText = hours;
                document.getElementById('minutes').innerText = minutes;
            }
        } else {
            document.getElementById('countdown')?.remove();
        }

        // Old standalone dashboard countdown (remove)
        document.getElementById('dashboard-countdown')?.remove();

        // Stats bar phase countdown (segmented display)
        const phase = _getActivePhase();
        const labelEl = document.getElementById('dashboard-countdown-label');
        const daysEl = document.getElementById('dash-cd-days');
        const hoursEl = document.getElementById('dash-cd-hours');
        const minsEl = document.getElementById('dash-cd-mins');
        if (labelEl) {
            if (phase) {
                const phaseDistance = phase.date.getTime() - new Date().getTime();
                labelEl.textContent = phase.label;
                if (phaseDistance > 0) {
                    const pd = Math.floor(phaseDistance / (1000 * 60 * 60 * 24));
                    const ph = Math.floor((phaseDistance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const pm = Math.floor((phaseDistance % (1000 * 60 * 60)) / (1000 * 60));
                    if (daysEl) daysEl.textContent = String(pd).padStart(2, '0');
                    if (hoursEl) hoursEl.textContent = String(ph).padStart(2, '0');
                    if (minsEl) minsEl.textContent = String(pm).padStart(2, '0');
                } else {
                    if (daysEl) daysEl.textContent = '00';
                    if (hoursEl) hoursEl.textContent = '00';
                    if (minsEl) minsEl.textContent = '00';
                }
            } else {
                labelEl.textContent = 'Tournament';
                if (daysEl) daysEl.textContent = 'All';
                if (hoursEl) hoursEl.textContent = 'Done';
                if (minsEl) minsEl.textContent = '🏆';
            }
        }
    };

    updateCountdownDisplays();
    setInterval(updateCountdownDisplays, 1000);
}

window.addEventListener('resize', () => {
    syncMobileRosterState();
});

document.addEventListener('DOMContentLoaded', () => {
    const picksScroll = document.getElementById('picks-main-scroll');
    if (picksScroll) {
        picksScroll.addEventListener('scroll', () => updatePicksRulesHelpAnchor(false), { passive: true });
    }

    updatePicksRulesHelpAnchor(true);
});

Object.assign(window, {
    showToast,
    showConfirmModal,
    showSimulationStageModal,
    showProfileSetupModal,
    showPage,
    toggleMobileMenu,
    toggleMobileRoster,
    togglePicksRulesBar,
    updatePicksRulesHelpAnchor,
    syncMobileRosterState,
    renderPool,
    updateUI,
    renderGroups,
    startCountdown
});
