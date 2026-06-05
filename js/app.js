const saveState = {
    picksDirty: false,
    identityDirty: false,
    isSaving: false,
    lastSavedAt: null,
    failed: false
};
const POOL_JOIN_PASSWORD = 'fifafifa26';
let profileStatusChannel = null;
let blockedStatusPollInterval = null;
let blockedVisibilityListenerAttached = false;
let blockedEnforcementArmed = false;

function getProfileStorageKey(email = userEmail) {
    return email ? `wc_pool_profile_${email}` : null;
}

function getNotificationSeenKey(email = userEmail) {
    return email ? `wc_pool_seen_notification_${email}` : null;
}

function getAuthRedirectUrl() {
    return `${window.location.origin}${window.location.pathname}`;
}

async function showAvatarCropModal(file, favoriteTeam = '') {
    const modal = document.getElementById('avatar-crop-modal');
    const img = document.getElementById('avatar-crop-image');
    const stage = document.getElementById('avatar-crop-stage');
    const zoomInput = document.getElementById('avatar-crop-zoom');
    const flagBadge = document.getElementById('avatar-crop-flag-badge');
    const saveBtn = document.getElementById('avatar-crop-save');
    const cancelBtn = document.getElementById('avatar-crop-cancel');
    const closeBtn = document.getElementById('avatar-crop-close');
    if (!modal || !img || !stage || !zoomInput || !saveBtn || !cancelBtn) return null;

    const STAGE_SIZE = 280;
    const TARGET_SIZE = 256;

    const favKey = (favoriteTeam || '').trim().toLowerCase();
    const fav = (typeof teams !== 'undefined' ? teams : []).find((t) => (t.name || '').trim().toLowerCase() === favKey);
    if (flagBadge) {
        flagBadge.textContent = fav?.flag || '';
        flagBadge.style.display = fav?.flag ? '' : 'none';
    }

    const url = URL.createObjectURL(file);
    img.src = url;
    try {
        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Could not load image'));
        });
    } catch (err) {
        URL.revokeObjectURL(url);
        return null;
    }

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const coverScale = Math.max(STAGE_SIZE / nw, STAGE_SIZE / nh);

    let zoomFactor = 1.0;
    let tx = 0;
    let ty = 0;
    zoomInput.value = '1';

    const updateTransform = () => {
        const displayW = nw * coverScale * zoomFactor;
        const displayH = nh * coverScale * zoomFactor;
        const baseLeft = (STAGE_SIZE - displayW) / 2;
        const baseTop = (STAGE_SIZE - displayH) / 2;
        // Constrain so image always covers the stage (no empty edges)
        const minTx = STAGE_SIZE - displayW - baseLeft;
        const maxTx = -baseLeft;
        const minTy = STAGE_SIZE - displayH - baseTop;
        const maxTy = -baseTop;
        tx = Math.min(maxTx, Math.max(minTx, tx));
        ty = Math.min(maxTy, Math.max(minTy, ty));
        img.style.width = displayW + 'px';
        img.style.height = displayH + 'px';
        img.style.left = (baseLeft + tx) + 'px';
        img.style.top = (baseTop + ty) + 'px';
    };
    updateTransform();

    const handleZoom = () => {
        zoomFactor = parseFloat(zoomInput.value) || 1;
        updateTransform();
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const getPoint = (e) => (e.touches?.[0] ?? e);
    const onPointerDown = (e) => {
        dragging = true;
        const p = getPoint(e);
        lastX = p.clientX;
        lastY = p.clientY;
        stage.style.cursor = 'grabbing';
        e.preventDefault();
    };
    const onPointerMove = (e) => {
        if (!dragging) return;
        const p = getPoint(e);
        tx += p.clientX - lastX;
        ty += p.clientY - lastY;
        lastX = p.clientX;
        lastY = p.clientY;
        updateTransform();
        e.preventDefault();
    };
    const onPointerUp = () => {
        dragging = false;
        stage.style.cursor = 'grab';
    };

    zoomInput.addEventListener('input', handleZoom);
    stage.addEventListener('mousedown', onPointerDown);
    stage.addEventListener('touchstart', onPointerDown, { passive: false });
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchend', onPointerUp);

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    return new Promise((resolve) => {
        const cleanup = (result) => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            URL.revokeObjectURL(url);
            zoomInput.removeEventListener('input', handleZoom);
            stage.removeEventListener('mousedown', onPointerDown);
            stage.removeEventListener('touchstart', onPointerDown);
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchend', onPointerUp);
            saveBtn.removeEventListener('click', handleSave);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn?.removeEventListener('click', handleCancel);
            resolve(result);
        };
        const handleSave = async () => {
            const displayW = nw * coverScale * zoomFactor;
            const displayH = nh * coverScale * zoomFactor;
            const baseLeft = (STAGE_SIZE - displayW) / 2;
            const baseTop = (STAGE_SIZE - displayH) / 2;
            const left = baseLeft + tx;
            const top = baseTop + ty;
            const sx = -left / (coverScale * zoomFactor);
            const sy = -top / (coverScale * zoomFactor);
            const sSize = STAGE_SIZE / (coverScale * zoomFactor);
            const canvas = document.createElement('canvas');
            canvas.width = TARGET_SIZE;
            canvas.height = TARGET_SIZE;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, TARGET_SIZE, TARGET_SIZE);
            const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
            cleanup(blob);
        };
        const handleCancel = () => cleanup(null);
        saveBtn.addEventListener('click', handleSave);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn?.addEventListener('click', handleCancel);
    });
}

async function _cropImageToSquareBlob(file, targetSize = 256, quality = 0.85) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Could not load image'));
            image.src = url;
        });
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);
        return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function uploadAvatarBlob(blob, email, filename = 'avatar.jpg') {
    if (!blob) throw new Error('No image to upload.');
    const safeEmail = (email || '').replace(/[^a-zA-Z0-9.@_-]/g, '_');
    const safeFilename = (filename || 'avatar.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${safeEmail}/${safeFilename}`;
    const { error } = await supabaseClient.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (error) throw error;
    const { data } = supabaseClient.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
}

async function pickAndUploadAvatar(file, email, filename = 'avatar.jpg', favoriteTeam = '') {
    if (!file || !file.type?.startsWith('image/')) throw new Error('Please choose an image file.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Image is too large (max 10 MB).');
    let blob = null;
    if (typeof showAvatarCropModal === 'function') {
        blob = await showAvatarCropModal(file, favoriteTeam);
        if (!blob) return null; // user cancelled
    } else {
        blob = await _cropImageToSquareBlob(file, 256, 0.85);
    }
    return await uploadAvatarBlob(blob, email, filename);
}

async function previewNewUserOnboarding() {
    if (!userEmail) {
        showToast('Sign in first.');
        return;
    }
    const result = await showProfileSetupModal(userEmail, {
        nickname: '',
        realname: '',
        favoriteTeam: '',
        homeCountry: '',
        avatarUrl: '',
        googleAvatarUrl: '',
        preview: true
    });
    if (result) {
        showToast('Preview only — nothing was saved.');
    }
}

function _updateProfileAvatarPreview(avatarUrl) {
    const preview = document.getElementById('profile-avatar-preview');
    if (!preview) return;
    const favorite = document.getElementById('favorite-team-input')?.value || '';
    const nickname = document.getElementById('nickname-input')?.value || '';
    if (typeof _renderPlayerAvatar === 'function') {
        preview.innerHTML = _renderPlayerAvatar(avatarUrl, favorite, 72, nickname);
    }
    const removeBtn = document.getElementById('profile-avatar-remove');
    if (removeBtn) removeBtn.classList.toggle('hidden', !avatarUrl);
}

async function handleProfileAvatarChange(event) {
    const file = event.target?.files?.[0];
    if (!file) return;
    const statusEl = document.getElementById('profile-avatar-status');
    const favoriteTeam = document.getElementById('favorite-team-input')?.value || '';
    try {
        const url = await pickAndUploadAvatar(file, userEmail, 'avatar.jpg', favoriteTeam);
        if (!url) {
            if (statusEl) statusEl.textContent = '';
            return;
        }
        if (statusEl) statusEl.textContent = 'Saving…';
        const { error } = await supabaseClient.from('profiles').upsert({ email: userEmail, avatar_url: url }, { onConflict: 'email' });
        if (error) throw error;
        _updateProfileAvatarPreview(url);
        if (statusEl) statusEl.textContent = 'Saved ✓';
        setTimeout(() => { if (statusEl && statusEl.textContent === 'Saved ✓') statusEl.textContent = ''; }, 2000);
    } catch (error) {
        if (statusEl) statusEl.textContent = error.message || 'Upload failed';
    } finally {
        event.target.value = '';
    }
}

async function removeProfileAvatar() {
    const statusEl = document.getElementById('profile-avatar-status');
    try {
        if (statusEl) statusEl.textContent = 'Removing…';
        const { error } = await supabaseClient.from('profiles').upsert({ email: userEmail, avatar_url: '' }, { onConflict: 'email' });
        if (error) throw error;
        _updateProfileAvatarPreview('');
        if (statusEl) statusEl.textContent = 'Removed ✓';
        setTimeout(() => { if (statusEl && statusEl.textContent === 'Removed ✓') statusEl.textContent = ''; }, 2000);
    } catch (error) {
        if (statusEl) statusEl.textContent = error.message || 'Remove failed';
    }
}

function saveProfileIdentityLocal(email, profile) {
    const storageKey = getProfileStorageKey(email);
    if (!storageKey || !profile) {
        return;
    }

    localStorage.setItem(storageKey, JSON.stringify({
        nickname: profile.nickname || '',
        realname: profile.realname || '',
        favoriteTeam: profile.favoriteTeam || '',
        homeCountry: profile.homeCountry || ''
    }));
}

function getLocalProfileIdentity(email) {
    const storageKey = getProfileStorageKey(email);
    if (!storageKey) {
        return null;
    }

    const raw = localStorage.getItem(storageKey);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function getCurrentProfileIdentity() {
    const localProfile = getLocalProfileIdentity(userEmail) || {};
    const favoriteTeamInput = document.getElementById('favorite-team-input');
    const homeCountryInput = document.getElementById('home-country-input');
    const nicknameInput = document.getElementById('nickname-input');
    const realnameInput = document.getElementById('realname-input');

    return {
        nickname: nicknameInput?.value || localProfile.nickname || '',
        realname: realnameInput?.value || localProfile.realname || '',
        favoriteTeam: favoriteTeamInput?.value || localProfile.favoriteTeam || '',
        homeCountry: homeCountryInput?.value || localProfile.homeCountry || ''
    };
}

function updateFaviconForTeam(favoriteTeam) {
    const team = favoriteTeam && typeof teams !== 'undefined'
        ? teams.find((t) => t.name === favoriteTeam)
        : null;
    const emoji = team?.flag || '⚽';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0b1220"/><text x="50%" y="55%" text-anchor="middle" font-size="34">${emoji}</text></svg>`;
    const link = document.querySelector('link[rel="icon"]');
    if (link) {
        link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
}

function getLastSeenNotificationId(email = userEmail) {
    const key = getNotificationSeenKey(email);
    if (!key) {
        return 0;
    }

    return Number(localStorage.getItem(key) || 0);
}

function markNotificationSeen(notificationId, email = userEmail) {
    const key = getNotificationSeenKey(email);
    if (!key || !notificationId) {
        return;
    }

    localStorage.setItem(key, String(notificationId));
}

function formatSavedTime(timestamp) {
    return new Date(timestamp).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function updateSaveStatusUI() {
    const status = document.getElementById('save-status');
    const dashboardStatus = document.getElementById('dashboard-save-status');

    if (!status && !dashboardStatus) {
        return;
    }

    const applyStatus = (element, mode, text, classes) => {
        if (!element) {
            return;
        }

        if (mode === 'dashboard') {
            element.className = 'mt-2 text-xl font-black uppercase italic';
            element.classList.add(classes.text);
        } else {
            element.className = 'rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-center w-full';
            element.classList.add(classes.text, classes.border, classes.background);
        }

        element.textContent = text;
    };

    const setContent = (text, classes) => {
        applyStatus(status, 'default', text, classes);
        applyStatus(dashboardStatus, 'dashboard', text, classes);
    };

    if (saveState.isSaving) {
        setContent('Saving changes...', { text: 'theme-accent-text', border: 'theme-status-border', background: 'theme-status-bg' });
        return;
    }

    if (saveState.picksDirty || saveState.identityDirty) {
        setContent('Unsaved changes', { text: 'text-amber-300', border: 'border-amber-500/30', background: 'bg-amber-500/10' });
        return;
    }

    if (saveState.failed) {
        setContent('Save failed', { text: 'text-red-300', border: 'border-red-500/30', background: 'bg-red-500/10' });
        return;
    }

    if (!saveState.lastSavedAt && !saveState.picksDirty && !saveState.identityDirty && userEmail && myPicks.length === 0) {
        setContent('No team saved. Select a team.', { text: 'text-red-300', border: 'border-red-500/30', background: 'bg-red-500/10' });
        return;
    }

    if (saveState.lastSavedAt) {
        setContent(`Saved: ${formatSavedTime(saveState.lastSavedAt)}`, { text: 'text-green-300', border: 'border-green-500/30', background: 'bg-green-500/10' });
        return;
    }

    setContent('No changes yet', { text: 'text-gray-400', border: 'border-gray-800', background: 'bg-gray-900/70' });
}

async function hydrateSavedTimestamp() {
    if (!userEmail) {
        saveState.lastSavedAt = null;
        updateSaveStatusUI();
        return;
    }

    try {
        const { data, count, error } = await supabaseClient
            .from('picks')
            .select('updated_at', { count: 'exact' })
            .eq('user_email', userEmail)
            .order('updated_at', { ascending: false })
            .limit(1);

        if (error) {
            throw error;
        }

        saveState.lastSavedAt = count > 0 ? (data?.[0]?.updated_at || null) : null;
    } catch (error) {
        saveState.lastSavedAt = null;
    }

    updateSaveStatusUI();
}

function markPicksDirty() {
    saveState.failed = false;
    saveState.picksDirty = true;
    updateSaveStatusUI();
}

function markIdentityDirty() {
    saveState.failed = false;
    saveState.identityDirty = true;
    updateSaveStatusUI();
}

function clearDirtyFlags() {
    saveState.failed = false;
    saveState.picksDirty = false;
    saveState.identityDirty = false;
    updateSaveStatusUI();
}

function setupIdentityChangeTracking() {
    const nicknameInput = document.getElementById('nickname-input');
    const realnameInput = document.getElementById('realname-input');
    const favoriteTeamInput = document.getElementById('favorite-team-input');
    const homeCountryInput = document.getElementById('home-country-input');

    [nicknameInput, realnameInput, favoriteTeamInput, homeCountryInput].forEach((input) => {
        if (!input || input.dataset.saveTrackingBound === 'true') {
            return;
        }

        input.addEventListener('input', () => {
            if (!userEmail) {
                return;
            }

            markIdentityDirty();
        });
        input.dataset.saveTrackingBound = 'true';
    });
}

function populateProfileSelectOptions() {
    initializeTeamDropdown({
        rootId: 'profile-favorite-team-field',
        inputId: 'favorite-team-input',
        labelId: 'favorite-team-label',
        panelId: 'favorite-team-panel',
        searchId: 'favorite-team-search',
        listId: 'favorite-team-list',
        placeholder: 'Select a team',
        emptyLabel: 'Select a team',
        includeEmptyOption: true
    });

    initializeTeamDropdown({
        rootId: 'profile-home-country-field',
        inputId: 'home-country-input',
        labelId: 'home-country-label',
        panelId: 'home-country-panel',
        searchId: 'home-country-search',
        listId: 'home-country-list',
        placeholder: 'Select a country',
        emptyLabel: 'Select a country',
        includeEmptyOption: true
    });

    syncProfileDropdownValues();
}

function setupProfile() {
    const emailDisplay = document.getElementById('profile-email-display');
    const favoriteTeamInput = document.getElementById('favorite-team-input');

    if (emailDisplay) {
        emailDisplay.textContent = userEmail || '-';
    }

    if (typeof window.renderProfileFavoriteBanner === 'function') {
        window.renderProfileFavoriteBanner();
    }

    if (typeof window.applyPicksAccentTheme === 'function') {
        window.applyPicksAccentTheme(getCurrentProfileIdentity());
    }
    updateFaviconForTeam(getCurrentProfileIdentity().favoriteTeam);

    if (favoriteTeamInput && favoriteTeamInput.dataset.profileBannerBound !== 'true') {
        favoriteTeamInput.addEventListener('change', () => {
            if (typeof window.renderProfileFavoriteBanner === 'function') {
                window.renderProfileFavoriteBanner();
            }
            if (typeof window.applyPicksAccentTheme === 'function') {
                window.applyPicksAccentTheme(getCurrentProfileIdentity());
            }
            updateFaviconForTeam(favoriteTeamInput.value);
        });
        favoriteTeamInput.dataset.profileBannerBound = 'true';
    }
}

async function fetchAppSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('app_settings')
            .select('key, picks_locked, auto_lock_at_kickoff, hide_team_selection, hide_player_chips')
            .eq('key', 'global')
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (data) {
            appSettings.picksLocked = Boolean(data.picks_locked);
            appSettings.autoLockAtKickoff = data.auto_lock_at_kickoff !== false;
            appSettings.hideTeamSelection = Boolean(data.hide_team_selection);
            appSettings.hidePlayerChips = Boolean(data.hide_player_chips);
        }
    } catch (error) {
        appSettings.picksLocked = false;
        appSettings.autoLockAtKickoff = true;
        appSettings.hideTeamSelection = false;
        appSettings.hidePlayerChips = false;
    }

    try {
        appSettings.autoTeamStatusSync = localStorage.getItem('wc_pool_auto_team_status_sync') === 'true';
    } catch (error) {
        appSettings.autoTeamStatusSync = false;
    }

    refreshLockState();
    if (typeof applyPublicVisibilityStyles === 'function') applyPublicVisibilityStyles();
    return appSettings;
}

async function fetchAdvancedTeams() {
    try {
        const { data, error } = await supabaseClient
            .from('team_advancement')
            .select('team_name, advanced_to_knockouts, eliminated');

        if (error) {
            throw error;
        }

        const rows = data || [];
        advancedTeams = new Set(rows.filter((row) => row.advanced_to_knockouts).map((row) => row.team_name));
        eliminatedTeams = new Set(rows.filter((row) => row.eliminated).map((row) => row.team_name));
    } catch (error) {
        advancedTeams = new Set();
        eliminatedTeams = new Set();
    }

    return advancedTeams;
}

async function saveAppSettings(nextSettings = {}) {
    const payload = {
        key: 'global',
        picks_locked: Boolean(nextSettings.picksLocked),
        auto_lock_at_kickoff: nextSettings.autoLockAtKickoff !== false,
        hide_team_selection: Boolean(nextSettings.hideTeamSelection),
        hide_player_chips: Boolean(nextSettings.hidePlayerChips)
    };

    const { error } = await supabaseClient
        .from('app_settings')
        .upsert(payload, { onConflict: 'key' });

    if (error) {
        throw error;
    }

    appSettings.picksLocked = payload.picks_locked;
    appSettings.autoLockAtKickoff = payload.auto_lock_at_kickoff;
    appSettings.hideTeamSelection = payload.hide_team_selection;
    appSettings.hidePlayerChips = payload.hide_player_chips;
    refreshLockState();
    return appSettings;
}

const teamDropdownRegistry = new Map();
let teamDropdownGlobalHandlersBound = false;

function escapeDropdownHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildTeamDropdownOptions({ qualifiedOnly = false, includeEmptyOption = false, emptyLabel = '' } = {}) {
    const sortedTeams = [...teams]
        .filter((team) => !qualifiedOnly || team.qualified !== false)
        .sort((a, b) => a.name.localeCompare(b.name));

    const options = sortedTeams.map((team) => ({
        value: team.name,
        label: team.name,
        display: `${team.flag} ${team.name}`,
        flag: team.flag || ''
    }));

    if (includeEmptyOption) {
        options.unshift({
            value: '',
            label: emptyLabel,
            display: emptyLabel,
            flag: '',
            isEmpty: true
        });
    }

    return options;
}

function bindTeamDropdownGlobalHandlers() {
    if (teamDropdownGlobalHandlersBound) {
        return;
    }

    document.addEventListener('click', (event) => {
        teamDropdownRegistry.forEach((instance, rootId) => {
            if (!instance.root.contains(event.target)) {
                closeTeamDropdown(rootId);
            }
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            teamDropdownRegistry.forEach((_, rootId) => closeTeamDropdown(rootId));
        }
    });

    teamDropdownGlobalHandlersBound = true;
}

function getTeamDropdownInstance(rootId) {
    return teamDropdownRegistry.get(rootId) || null;
}

function renderTeamDropdownOptions(rootId) {
    const instance = getTeamDropdownInstance(rootId);
    if (!instance?.list) {
        return;
    }

    const query = (instance.search?.value || '').trim().toLowerCase();
    const filteredOptions = instance.options.filter((option) => {
        if (!query) {
            return true;
        }

        return `${option.label} ${option.flag}`.toLowerCase().includes(query);
    });

    if (filteredOptions.length === 0) {
        instance.list.innerHTML = '<div class="px-4 py-4 text-sm font-bold text-gray-400">No teams found.</div>';
        return;
    }

    instance.list.innerHTML = filteredOptions.map((option) => `
        <button type="button"
            data-team-dropdown-value="${escapeDropdownHtml(option.value)}"
            class="team-dropdown-option w-full border-b border-gray-100 px-4 py-2.5 text-left text-sm font-bold transition-colors last:border-0 ${option.value ? 'text-gray-900 hover:bg-gray-50' : 'text-gray-400 hover:bg-gray-50'}">
            ${option.flag ? `<span class="mr-3 text-lg leading-none">${escapeDropdownHtml(option.flag)}</span>` : ''}
            <span>${escapeDropdownHtml(option.label)}</span>
        </button>
    `).join('');

    instance.list.querySelectorAll('[data-team-dropdown-value]').forEach((button) => {
        button.addEventListener('click', () => {
            setTeamDropdownValue(rootId, button.dataset.teamDropdownValue || '');
        });
    });
}

function openTeamDropdown(rootId, initialQuery = '') {
    const instance = getTeamDropdownInstance(rootId);
    if (!instance || instance.button?.disabled) {
        return;
    }

    teamDropdownRegistry.forEach((_, otherRootId) => {
        if (otherRootId !== rootId) {
            closeTeamDropdown(otherRootId);
        }
    });

    if (instance.search) {
        instance.search.value = initialQuery;
    }

    renderTeamDropdownOptions(rootId);
    instance.panel.classList.remove('hidden');
    instance.panel.classList.add('open');

    const chevron = instance.root.querySelector('.team-dropdown-chevron');
    if (chevron) {
        chevron.style.transform = 'rotate(180deg)';
    }

    if (instance.search) {
        window.setTimeout(() => {
            instance.search.focus();
            const len = instance.search.value.length;
            instance.search.setSelectionRange(len, len);
        }, 0);
    }
}

function closeTeamDropdown(rootId) {
    const instance = getTeamDropdownInstance(rootId);
    if (!instance) {
        return;
    }

    instance.panel.classList.add('hidden');
    instance.panel.classList.remove('open');
    const chevron = instance.root.querySelector('.team-dropdown-chevron');
    if (chevron) {
        chevron.style.transform = '';
    }

    if (instance.search && instance.search.value) {
        instance.search.value = '';
        renderTeamDropdownOptions(rootId);
    }
}

function setTeamDropdownValue(rootId, value, { silent = false } = {}) {
    const instance = getTeamDropdownInstance(rootId);
    if (!instance?.input || !instance?.label) {
        return;
    }

    const selected = instance.options.find((option) => option.value === value) || null;
    instance.root.dataset.value = value;
    instance.input.value = value;

    if (selected && selected.value) {
        instance.label.textContent = selected.display;
        instance.label.classList.remove('text-gray-400');
        instance.label.classList.add('text-gray-900');
    } else {
        instance.label.textContent = instance.placeholder;
        instance.label.classList.remove('text-gray-900');
        instance.label.classList.add('text-gray-400');
    }

    closeTeamDropdown(rootId);

    if (!silent) {
        instance.input.dispatchEvent(new Event('input', { bubbles: true }));
        instance.input.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof instance.onChange === 'function') {
            instance.onChange(value);
        }
    }
}

function syncTeamDropdownValue(rootId, value) {
    setTeamDropdownValue(rootId, value || '', { silent: true });
}

function toggleTeamDropdown(rootId) {
    const instance = getTeamDropdownInstance(rootId);
    if (!instance) {
        return;
    }

    if (instance.panel.classList.contains('hidden')) {
        openTeamDropdown(rootId);
    } else {
        closeTeamDropdown(rootId);
    }
}

function filterTeamDropdownOptions(rootId) {
    renderTeamDropdownOptions(rootId);
}

function handleTeamDropdownSearchKeydown(event, rootId) {
    const instance = getTeamDropdownInstance(rootId);
    if (!instance) {
        return;
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        closeTeamDropdown(rootId);
        instance.button?.focus();
        return;
    }

    if (event.key === 'Enter') {
        const firstOption = instance.list?.querySelector('[data-team-dropdown-value]');
        if (firstOption) {
            event.preventDefault();
            setTeamDropdownValue(rootId, firstOption.dataset.teamDropdownValue || '');
        }
    }
}

function initializeTeamDropdown({
    rootId,
    inputId,
    labelId,
    buttonId,
    panelId,
    searchId,
    listId,
    placeholder,
    emptyLabel = placeholder,
    includeEmptyOption = false,
    qualifiedOnly = false,
    onChange = null
}) {
    const root = document.getElementById(rootId);
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    const button = document.getElementById(buttonId) || root?.querySelector('button');
    const panel = document.getElementById(panelId);
    const search = document.getElementById(searchId);
    const list = document.getElementById(listId);

    if (!root || !input || !label || !button || !panel || !list) {
        return;
    }

    const instance = {
        root,
        input,
        label,
        button,
        panel,
        search,
        list,
        placeholder,
        onChange,
        options: buildTeamDropdownOptions({ qualifiedOnly, includeEmptyOption, emptyLabel })
    };

    teamDropdownRegistry.set(rootId, instance);
    bindTeamDropdownGlobalHandlers();

    if (button.dataset.teamDropdownBound !== 'true') {
        button.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openTeamDropdown(rootId);
                return;
            }

            if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
                return;
            }

            openTeamDropdown(rootId, event.key);
            event.preventDefault();
        });
        button.dataset.teamDropdownBound = 'true';
    }

    if (search && search.dataset.teamDropdownBound !== 'true') {
        search.addEventListener('input', () => renderTeamDropdownOptions(rootId));
        search.dataset.teamDropdownBound = 'true';
    }

    renderTeamDropdownOptions(rootId);
    syncTeamDropdownValue(rootId, input.value || '');
}

function populateCountryFilter() {
    initializeTeamDropdown({
        rootId: 'leaderboard-country-filter',
        inputId: 'leaderboard-country-filter-input',
        labelId: 'country-filter-label',
        buttonId: 'country-filter-btn',
        panelId: 'country-filter-panel',
        searchId: 'country-filter-search',
        listId: 'country-filter-list',
        placeholder: 'All Countries',
        emptyLabel: 'All Countries',
        includeEmptyOption: true,
        qualifiedOnly: true,
        onChange: () => {
            if (typeof fetchLeaderboard === 'function') {
                fetchLeaderboard();
            }
        }
    });
}

function toggleCountryFilter() {
    toggleTeamDropdown('leaderboard-country-filter');
}

function closeCountryFilter() {
    closeTeamDropdown('leaderboard-country-filter');
}

function selectCountryFilter(value) {
    setTeamDropdownValue('leaderboard-country-filter', value || '');
}

function syncProfileDropdownValues() {
    syncTeamDropdownValue('profile-favorite-team-field', document.getElementById('favorite-team-input')?.value || '');
    syncTeamDropdownValue('profile-home-country-field', document.getElementById('home-country-input')?.value || '');
}

async function checkAdminStatus() {
    const desktopAdminLink = document.getElementById('nav-admin');
    const mobileAdminLink = document.getElementById('mobile-nav-admin');

    const hide = (el) => { if (!el) return; el.classList.add('hidden'); el.style.display = 'none'; };
    const show = (el) => { if (!el) return; el.classList.remove('hidden'); el.style.display = ''; };

    hide(desktopAdminLink);
    hide(mobileAdminLink);

    const isAdmin = Boolean(userEmail) && typeof isProtectedAdminEmail === 'function' && isProtectedAdminEmail(userEmail);
    if (isAdmin) {
        show(desktopAdminLink);
        show(mobileAdminLink);
    }
    return isAdmin;
}

function toggleTeam(name) {
    if (isLocked) {
        showConfirmModal({
            label: 'Locked',
            icon: '🔒',
            title: 'Picks Locked',
            message: 'The World Cup has started, the picks are locked. Good luck!',
            confirmText: 'Okay',
            singleAction: true
        });
        return;
    }

    const team = teams.find((entry) => entry.name === name);
    if (!team) {
        return;
    }

    if (team.qualified === false) {
        showConfirmModal({
            label: 'LOL',
            icon: '🇮🇹',
            title: 'Nice Try',
            message: 'Pick a team that qualified.',
            detail: 'Italy can still be your favourite team or home country.',
            confirmText: 'Okay',
            singleAction: true
        });
        return;
    }

    const existingIndex = myPicks.findIndex((entry) => entry.name === name);

    if (existingIndex > -1) {
        myPicks.splice(existingIndex, 1);
    } else {
        if (team.tier === 1) {
            myPicks = myPicks.filter((entry) => entry.tier !== 1);
        }

        myPicks.push(team);
    }

    updateUI();
    markPicksDirty();
}

async function getExistingProfile(email) {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('nickname, realname, favorite_team, home_country, has_paid, avatar_url, updated_at, picks_save_count, blocked')
        .eq('email', email)
        .maybeSingle();

    if (error) {
        throw error;
    }

    const dbProfile = data || null;
    if (dbProfile) {
        return dbProfile;
    }

    const localProfile = getLocalProfileIdentity(email);
    if (!localProfile) {
        return null;
    }

    return {
        nickname: localProfile.nickname || '',
        realname: localProfile.realname || '',
        favorite_team: localProfile.favoriteTeam || '',
        home_country: localProfile.homeCountry || ''
    };
}

async function startGoogleLogin() {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: getAuthRedirectUrl()
            }
        });

        if (error) {
            throw error;
        }
    } catch (error) {
        showToast(error.message || 'Unable to start Google sign-in right now.');
    }
}

async function upsertProfile(email, profile = {}) {
    const updatedAt = new Date().toISOString();
    const payload = {
        email,
        nickname: profile.nickname || '',
        realname: profile.realname || '',
        favorite_team: profile.favoriteTeam || '',
        home_country: profile.homeCountry || '',
        updated_at: updatedAt
    };

    if (typeof profile.has_paid === 'boolean') {
        payload.has_paid = profile.has_paid;
    }

    if (typeof profile.avatar_url === 'string') {
        payload.avatar_url = profile.avatar_url;
    }

    const { error } = await supabaseClient
        .from('profiles')
        .upsert(payload, { onConflict: 'email' });

    if (error) {
        throw error;
    }

    return updatedAt;
}

function confirmNewProfileEmail(email) {
    return showConfirmModal({
        title: 'Create New Profile?',
        message: `No profile was found for ${email}.`,
        detail: 'Please double-check for typos before continuing.',
        confirmText: 'Create Profile',
        cancelText: 'Go Back'
    });
}

function showPaymentReminderModal() {
    return showConfirmModal({
        label: 'Payment Due',
        icon: '💸',
        title: 'Still To Pay',
        message: 'You have not paid yet.',
        detail: 'Please contact the Commissioner for payment.',
        confirmText: 'Okay',
        singleAction: true
    });
}

function showWelcomeModal() {
    return showConfirmModal({
        label: 'Welcome',
        icon: '🎉',
        title: 'You Are In The Pool',
        message: 'Your account has been created successfully.',
        detail: 'Good luck building your squad.',
        confirmText: 'Let’s Go',
        singleAction: true
    });
}

async function showBroadcastNotification(notification) {
    if (!notification?.id || !notification?.message || !userEmail) {
        return;
    }

    if (activeNotificationId === notification.id || notification.id <= getLastSeenNotificationId()) {
        return;
    }

    activeNotificationId = notification.id;

    await showConfirmModal({
        label: 'Notification',
        icon: '📣',
        title: 'Pool Update',
        message: notification.message,
        detail: 'Sent by the commissioner desk.',
        confirmText: 'Okay',
        singleAction: true
    });

    markNotificationSeen(notification.id);
    activeNotificationId = null;
}

async function checkForBroadcastNotifications() {
    if (!userEmail) {
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('notifications')
            .select('id, message, created_at')
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (data) {
            await showBroadcastNotification(data);
        }
    } catch (error) {
        // Fail quietly if notifications are unavailable.
    }
}

function setupNotifications() {
    if (notificationChannel) {
        return;
    }

    notificationChannel = supabaseClient
        .channel('notifications-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, async (payload) => {
            await showBroadcastNotification(payload.new);
        })
        .subscribe();
}

async function enforceBlockedStatusIfNeeded() {
    if (!userEmail) {
        return false;
    }

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('blocked')
            .eq('email', userEmail)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (data?.blocked === true) {
            showBlockedAccessOverlay(userEmail);
            return true;
        }
    } catch (error) {
        // Fail quietly if this check is unavailable.
    }

    return false;
}

async function guardBlockedAccess() {
    if (!blockedEnforcementArmed) {
        return false;
    }

    return enforceBlockedStatusIfNeeded();
}

function handleBlockedVisibilityRefresh() {
    if (document.visibilityState === 'visible') {
        enforceBlockedStatusIfNeeded();
    }
}

function setupProfileStatusWatcher() {
    if (!userEmail) {
        return;
    }

    if (!profileStatusChannel) {
        profileStatusChannel = supabaseClient
            .channel(`profile-status-${userEmail}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `email=eq.${userEmail}`
            }, (payload) => {
                if (payload.new?.blocked === true) {
                    showBlockedAccessOverlay(userEmail);
                }
            })
            .subscribe();
    }

    if (!blockedStatusPollInterval) {
        blockedStatusPollInterval = window.setInterval(() => {
            enforceBlockedStatusIfNeeded();
        }, 3000);
    }

    if (!blockedVisibilityListenerAttached) {
        document.addEventListener('visibilitychange', handleBlockedVisibilityRefresh);
        blockedVisibilityListenerAttached = true;
    }

    blockedEnforcementArmed = true;
    enforceBlockedStatusIfNeeded();
}

async function completeLogin(email, existingProfile = null, options = {}) {
    const { showWelcome = false } = options;

    userEmail = email;
    localStorage.setItem('wc_pool_user_email', userEmail);
    await checkAdminStatus();
    await fetchAppSettings();

    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('top-nav').classList.remove('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    setTimeout(() => {
        document.getElementById('main-app').classList.remove('opacity-0');
    }, 50);

    setupProfile();
    populateProfileSelectOptions();

    if (existingProfile) {
        document.getElementById('nickname-input').value = existingProfile.nickname || '';
        document.getElementById('realname-input').value = existingProfile.realname || '';
        document.getElementById('favorite-team-input').value = existingProfile.favorite_team || '';
        document.getElementById('home-country-input').value = existingProfile.home_country || '';
        _updateProfileAvatarPreview(existingProfile.avatar_url || '');
    } else {
        document.getElementById('nickname-input').value = '';
        document.getElementById('realname-input').value = '';
        document.getElementById('favorite-team-input').value = '';
        document.getElementById('home-country-input').value = '';
        _updateProfileAvatarPreview('');
    }

    syncProfileDropdownValues();
    document.getElementById('favorite-team-input').dataset.savedValue = document.getElementById('favorite-team-input').value || '';
    if (typeof window.renderProfileFavoriteBanner === 'function') {
        window.renderProfileFavoriteBanner();
    }

    await hydrateSavedTimestamp();
    renderPool();
    await loadFromSupabase();
    clearDirtyFlags();
    startCountdown();
    showPage('instructions');
    setupLeaderboardRealtime();
    setupNotifications();
    setupProfileStatusWatcher();

    if (showWelcome) {
        await showWelcomeModal();
    }

    await checkForBroadcastNotifications();

    if (existingProfile && existingProfile.has_paid === false) {
        await showPaymentReminderModal();
    }
}

function showBlockedAccessOverlay(email) {
    userEmail = email;
    localStorage.setItem('wc_pool_user_email', userEmail);
    blockedEnforcementArmed = false;

    document.getElementById('auth-overlay')?.classList.add('hidden');
    document.getElementById('top-nav')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.add('hidden');
    const blockedOverlay = document.getElementById('blocked-overlay');
    blockedOverlay?.classList.remove('hidden');
    blockedOverlay?.classList.add('flex');
}

async function handleAuthenticatedUser(authUser) {
    const email = authUser?.email?.toLowerCase().trim();
    if (!email) {
        return false;
    }

    const existingProfile = await getExistingProfile(email);

    if (!existingProfile) {
        const googleAvatar = authUser.user_metadata?.avatar_url || '';
        const newProfile = await showProfileSetupModal(email, {
            realname: authUser.user_metadata?.full_name || authUser.user_metadata?.name || '',
            avatarUrl: googleAvatar,
            googleAvatarUrl: googleAvatar
        });

        if (!newProfile) {
            await supabaseClient.auth.signOut();
            return false;
        }

        if (newProfile.poolPassword !== POOL_JOIN_PASSWORD) {
            showToast('That pool password is not correct.');
            await supabaseClient.auth.signOut();
            return false;
        }

        const chosenAvatarUrl = newProfile.avatarUrl || googleAvatar || '';
        saveProfileIdentityLocal(email, newProfile);
        await upsertProfile(email, {
            ...newProfile,
            avatar_url: chosenAvatarUrl
        });

        await completeLogin(email, {
            nickname: newProfile.nickname,
            realname: newProfile.realname,
            favorite_team: newProfile.favoriteTeam,
            home_country: newProfile.homeCountry,
            avatar_url: chosenAvatarUrl,
            has_paid: false
        }, {
            showWelcome: true
        });
        return true;
    }

    if (existingProfile.blocked === true) {
        showBlockedAccessOverlay(email);
        return true;
    }

    if (authUser.user_metadata?.avatar_url && !existingProfile.avatar_url) {
        try {
            await upsertProfile(email, {
                nickname: existingProfile.nickname,
                realname: existingProfile.realname,
                favoriteTeam: existingProfile.favorite_team,
                homeCountry: existingProfile.home_country,
                has_paid: existingProfile.has_paid,
                avatar_url: authUser.user_metadata.avatar_url
            });
            existingProfile.avatar_url = authUser.user_metadata.avatar_url;
        } catch (error) {
            // Non-blocking profile enrichment.
        }
    }

    await completeLogin(email, existingProfile);
    return true;
}

async function restoreAuthLogin() {
    try {
        const { data, error } = await supabaseClient.auth.getUser();

        if (error) {
            throw error;
        }

        if (!data?.user) {
            return false;
        }

        return handleAuthenticatedUser(data.user);
    } catch (error) {
        return false;
    }
}

async function signOutUser() {
    blockedEnforcementArmed = false;

    try {
        await supabaseClient.auth.signOut();
    } catch (error) {
        // Fall through to local reset even if auth signout fails.
    }

    localStorage.removeItem('wc_pool_user_email');
    userEmail = '';
    myPicks = [];
    window.location.reload();
}

async function saveIdentityOnly() {
    if (await guardBlockedAccess()) {
        return;
    }

    const nickname = document.getElementById('nickname-input').value.trim();
    const realname = document.getElementById('realname-input').value.trim();
    const favoriteTeam = document.getElementById('favorite-team-input').value;
    const homeCountry = document.getElementById('home-country-input').value;

    if (!nickname || !realname) {
        return showToast('Enter both names.');
    }

    saveProfileIdentityLocal(userEmail, { nickname, realname, favoriteTeam, homeCountry });

    try {
        await upsertProfile(userEmail, { nickname, realname, favoriteTeam, homeCountry });

        saveState.failed = false;
        saveState.identityDirty = false;
        document.getElementById('favorite-team-input').dataset.savedValue = favoriteTeam || '';
        await hydrateSavedTimestamp();
        if (typeof window.renderProfileFavoriteBanner === 'function') {
            window.renderProfileFavoriteBanner();
        }
        if (typeof window.applyPicksAccentTheme === 'function') {
            window.applyPicksAccentTheme(getCurrentProfileIdentity());
        }
        updateFaviconForTeam(favoriteTeam);
        setupDashboard();
        fetchLeaderboard();
        fetchAdminUsers();
        showToast('Identity updated!', 'success');
    } catch (error) {
        updateSaveStatusUI();
        showToast(error.message);
    }
}

async function saveToSupabase() {
    if (await guardBlockedAccess()) {
        return;
    }

    if (isLocked) {
        showConfirmModal({
            label: 'Locked',
            icon: '🔒',
            title: 'Picks Locked',
            message: 'The World Cup has started, the picks are locked. Good luck!',
            confirmText: 'Okay',
            singleAction: true
        });
        return;
    }

    const nickname = document.getElementById('nickname-input').value.trim();
    const realname = document.getElementById('realname-input').value.trim();
    const favoriteTeam = document.getElementById('favorite-team-input').value;
    const homeCountry = document.getElementById('home-country-input').value;

    if (!nickname || !realname) {
        return showToast('Set Nickname and Real Name.');
    }

    saveProfileIdentityLocal(userEmail, { nickname, realname, favoriteTeam, homeCountry });

    const spent = myPicks.reduce((sum, team) => sum + team.cost, 0);
    if (spent > 150) {
        return showToast('Over budget.');
    }

    if (myPicks.filter((team) => team.tier === 3).length < 3) {
        return showToast('Pick at least 3 Tier 3 teams.');
    }

    const button = document.getElementById('save-btn');
    saveState.failed = false;
    saveState.isSaving = true;
    updateSaveStatusUI();
    button.innerText = 'Saving...';
    button.classList.add('saving');

    try {
        const pickRows = myPicks.map((team) => ({
            team_name: team.name,
            tier: team.tier,
            cost: team.cost
        }));

        await upsertProfile(userEmail, { nickname, realname, favoriteTeam, homeCountry });
        const { error: replaceError } = await supabaseClient.rpc('replace_user_picks_atomic', {
            p_user_email: userEmail,
            p_picks: pickRows
        });

        if (replaceError) {
            throw replaceError;
        }

        saveState.failed = false;
        saveState.picksDirty = false;
        saveState.identityDirty = false;
        await loadFromSupabase();
        await hydrateSavedTimestamp();
        fetchLeaderboard();
        fetchStats();
        fetchAdminUsers();
        setupDashboard();
        showToast('Saved!', 'success');
    } catch (error) {
        saveState.isSaving = false;
        saveState.failed = true;
        updateSaveStatusUI();
        showToast(error.message || 'Could not save picks. Your previous saved team is still intact.');
    } finally {
        saveState.isSaving = false;
        updateSaveStatusUI();
        button.innerText = 'Save';
        button.classList.remove('saving');
    }
}

async function loadFromSupabase() {
    if (await guardBlockedAccess()) {
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('picks')
            .select('*')
            .eq('user_email', userEmail);

        if (error) {
            throw error;
        }

        if (data?.length > 0) {
            myPicks = data
                .map((row) => teams.find((team) => team.name === row.team_name))
                .filter(Boolean);

            updateUI();
            return;
        }

        myPicks = [];
        updateUI();
    } catch (error) {
        console.error(error);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    populateCountryFilter();
    populateProfileSelectOptions();
    setupIdentityChangeTracking();
    fetchAppSettings();

    const restoredAuth = await restoreAuthLogin();
    if (restoredAuth) {
        return;
    }
});

Object.assign(window, {
    populateCountryFilter,
    populateProfileSelectOptions,
    toggleTeamDropdown,
    filterTeamDropdownOptions,
    handleTeamDropdownSearchKeydown,
    getCurrentProfileIdentity,
    fetchAppSettings,
    saveAppSettings,
    checkAdminStatus,
    setupProfile,
    toggleTeam,
    startGoogleLogin,
    restoreAuthLogin,
    signOutUser,
    saveIdentityOnly,
    saveToSupabase,
    loadFromSupabase
});
