/* ═══════════════════════════════════════════════════
   SnapVideo — Application Logic
   File handling, visibility engine, controls,
   snap system, persistence (.snapinfo)
   ═══════════════════════════════════════════════════ */

(() => {
    'use strict';

    // ─── DOM refs ───
    const $ = (s) => document.querySelector(s);
    const video = $('#video');
    const dropZone = $('#dropZone');
    const tintOverlay = $('#tintOverlay');
    const topBar = $('#topBar');
    const snapPanel = $('#snapPanel');
    const snapList = $('#snapList');
    const snapCount = $('#snapCount');
    const bottomControls = $('#bottomControls');
    const leftEdge = $('#leftEdge');
    const bottomEdge = $('#bottomEdge');
    const openFileBtn = $('#openFileBtn');
    const fileInput = $('#fileInput');
    const playPauseBtn = $('#playPauseBtn');
    const playIcon = $('#playIcon');
    const pauseIcon = $('#pauseIcon');
    const skipBackBtn = $('#skipBackBtn');
    const skipForwardBtn = $('#skipForwardBtn');
    const snapBtn = $('#snapBtn');
    const speedBtn = $('#speedBtn');
    const speedMenu = $('#speedMenu');
    const autoplayCheckbox = $('#autoplayCheckbox');
    const timeDisplay = $('#timeDisplay');
    const seekBarTrack = $('#seekBarTrack');
    const seekBarFill = $('#seekBarFill');
    const seekBarBuffered = $('#seekBarBuffered');
    const seekBarThumb = $('#seekBarThumb');
    const seekTooltip = $('#seekTooltip');
    const seekContainer = $('.seek-bar-container');
    const snapModal = $('#snapModal');
    const snapNameInput = $('#snapNameInput');
    const modalTimestamp = $('#modalTimestamp');
    const modalCancelBtn = $('#modalCancelBtn');
    const modalSnapBtn = $('#modalSnapBtn');
    const fullscreenBtn = $('#fullscreenBtn');
    const fsExpandIcon = $('#fsExpandIcon');
    const fsCompressIcon = $('#fsCompressIcon');
    const setFolderBtn = $('#setFolderBtn');
    const folderStatus = $('#folderStatus');
    const playbackStatus = $('#playbackStatus');

    // ─── State ───
    let snaps = [];
    let dirHandle = null;     // File System Access API directory handle
    let fileHandle = null;    // The opened video file handle
    let fileName = '';
    let hideTimer = null;
    let isBottomVisible = false;
    let isLeftVisible = false;
    let isTopVisible = false;
    let isModalOpen = false;
    let isSeeking = false;
    let speedMenuOpen = false;
    let currentSpeed = 1;
    let autoplayOnJump = true;
    let videoLoaded = false;

    // ─── IndexedDB for Persistence ───
    const dbName = 'SnapVideoDB';
    const storeName = 'handles';

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(storeName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveDirHandle(handle) {
        const db = await openDB();
        const tx = db.transaction(storeName, 'readwrite');
        await tx.objectStore(storeName).put(handle, 'dirHandle');
    }

    async function getDirHandle() {
        const db = await openDB();
        const tx = db.transaction(storeName, 'readonly');
        return await tx.objectStore(storeName).get('dirHandle');
    }

    async function initPersistence() {
        try {
            const handle = await getDirHandle();
            if (handle) {
                dirHandle = handle;
                folderStatus.textContent = 'Folder Set';
                setFolderBtn.classList.add('btn--accent');
                setFolderBtn.classList.remove('btn--ghost');
            }
        } catch (e) { }
    }

    initPersistence();

    setFolderBtn.addEventListener('click', async () => {
        try {
            const handle = await window.showDirectoryPicker();
            dirHandle = handle;
            await saveDirHandle(handle);
            folderStatus.textContent = 'Folder Set';
            setFolderBtn.classList.add('btn--accent');
            setFolderBtn.classList.remove('btn--ghost');
            if (videoLoaded) loadSnapInfo();
        } catch (e) {
            if (e.name !== 'AbortError') console.error('Folder selection failed:', e);
        }
    });

    // ─── Launch Queue (PWA File Handling) ───
    if ('launchQueue' in window) {
        launchQueue.setConsumer(async (launchParams) => {
            if (launchParams.files && launchParams.files.length > 0) {
                const handle = launchParams.files[0];
                const file = await handle.getFile();
                fileHandle = handle;
                fileName = file.name;
                loadVideoFromFile(file);
            }
        });
    }

    // ─── Utility ───
    function formatTime(sec) {
        if (isNaN(sec) || sec < 0) sec = 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function generateId() {
        return Math.random().toString(36).substring(2, 9);
    }

    // ═══════════════════════════════════════════
    // FILE HANDLING
    // ═══════════════════════════════════════════

    openFileBtn.addEventListener('click', openFilePicker);
    fileInput.addEventListener('change', handleFileInputChange);

    async function openFilePicker() {
        try {
            // Use File System Access API for persistence support
            if (window.showOpenFilePicker) {
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'Video files',
                        accept: { 'video/*': ['.mp4', '.mov'] }
                    }],
                    multiple: false
                });
                fileHandle = handle;
                // Get directory handle for .snapinfo persistence
                // We need to request the directory — but showOpenFilePicker only gives us file handle.
                // We'll use a workaround: ask for directory permission once.
                const file = await handle.getFile();
                fileName = file.name;
                loadVideoFromFile(file);
            } else {
                // Fallback: standard file input
                fileInput.click();
            }
        } catch (err) {
            if (err.name !== 'AbortError') console.error('File open error:', err);
        }
    }

    function handleFileInputChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        fileName = file.name;
        fileHandle = null;
        dirHandle = null;
        loadVideoFromFile(file);
    }

    function loadVideoFromFile(file) {
        const url = URL.createObjectURL(file);
        video.src = url;
        video.load();
        dropZone.classList.add('hidden');
        videoLoaded = true;
        document.body.classList.add('has-cursor');
        document.title = `${fileName} — SnapVideo`;

        video.addEventListener('loadedmetadata', () => {
            updateTimeDisplay();
            loadSnapInfo();
        }, { once: true });
    }

    // ─── Drag and Drop ───
    dropZone.addEventListener('click', () => {
        if (window.showOpenFilePicker) {
            openFilePicker();
        } else {
            fileInput.click();
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!videoLoaded) dropZone.classList.add('drag-over');
    });

    document.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null) dropZone.classList.remove('drag-over');
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && (file.type.startsWith('video/') || file.name.match(/\.(mp4|mov)$/i))) {
            fileName = file.name;
            fileHandle = null;
            dirHandle = null;
            loadVideoFromFile(file);
        }
    });

    // ═══════════════════════════════════════════
    // VISIBILITY ENGINE
    // ═══════════════════════════════════════════

    const HIDE_DELAY = 1000;

    function showOverlay(zone) {
        if (isModalOpen) return;

        if (zone === 'bottom' && !isBottomVisible) {
            isBottomVisible = true;
            bottomControls.classList.add('visible');
        }
        if (zone === 'left' && !isLeftVisible) {
            isLeftVisible = true;
            snapPanel.classList.add('visible');
            highlightNearestSnap();
        }
        if (zone === 'top' || zone === 'any') {
            if (!isTopVisible) {
                isTopVisible = true;
                topBar.classList.add('visible');
            }
        }

        updateTint();
        resetHideTimer();
    }

    function hideAllOverlays() {
        if (isModalOpen || isSeeking) return;

        isBottomVisible = false;
        isLeftVisible = false;
        isTopVisible = false;

        bottomControls.classList.remove('visible');
        snapPanel.classList.remove('visible');
        topBar.classList.remove('visible');
        tintOverlay.classList.remove('visible');
        playbackStatus.classList.remove('visible');
        document.body.classList.remove('controls-visible');

        closeSpeedMenu();
    }

    function updateTint() {
        if (isBottomVisible || isLeftVisible) {
            tintOverlay.classList.add('visible');
            document.body.classList.add('controls-visible');
        } else {
            tintOverlay.classList.remove('visible');
            document.body.classList.remove('controls-visible');
        }
    }

    function resetHideTimer() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hideAllOverlays, HIDE_DELAY);
    }

    // Mouse tracking
    document.addEventListener('mousemove', (e) => {
        if (!videoLoaded) return;

        const { clientX, clientY, target } = e;
        const windowH = window.innerHeight;
        const windowW = window.innerWidth;

        // Always show top bar on movement
        showOverlay('top');

        // Bottom zone
        if (clientY > windowH - 120) {
            showOverlay('bottom');
        }

        // Left zone
        if (clientX < 50 || snapPanel.contains(target)) {
            showOverlay('left');
        }

        resetHideTimer();
    });

    // Keep panels visible while hovering them
    snapPanel.addEventListener('mouseenter', () => {
        if (videoLoaded) { showOverlay('left'); clearTimeout(hideTimer); }
    });
    snapPanel.addEventListener('mouseleave', resetHideTimer);

    bottomControls.addEventListener('mouseenter', () => {
        if (videoLoaded) { showOverlay('bottom'); clearTimeout(hideTimer); }
    });
    bottomControls.addEventListener('mouseleave', resetHideTimer);

    topBar.addEventListener('mouseenter', () => {
        if (videoLoaded) { showOverlay('top'); clearTimeout(hideTimer); }
    });
    topBar.addEventListener('mouseleave', resetHideTimer);

    // ─── Background Click (Dismiss / Playback) ───
    video.addEventListener('click', handleBackgroundClick);
    tintOverlay.addEventListener('click', handleBackgroundClick);

    function handleBackgroundClick() {
        if (isBottomVisible || isLeftVisible || isTopVisible) {
            hideAllOverlays();
        } else {
            togglePlayPause();
        }
    }

    // ═══════════════════════════════════════════
    // VIDEO CONTROLS
    // ═══════════════════════════════════════════

    // Play / Pause
    playPauseBtn.addEventListener('click', togglePlayPause);

    function togglePlayPause() {
        if (!videoLoaded) return;
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    }

    video.addEventListener('play', updatePlayPauseIcon);
    video.addEventListener('pause', updatePlayPauseIcon);

    function updatePlayPauseIcon() {
        if (video.paused) {
            playIcon.style.display = '';
            pauseIcon.style.display = 'none';
            playbackStatus.textContent = 'PAUSED';
            playbackStatus.classList.add('visible');
        } else {
            playIcon.style.display = 'none';
            pauseIcon.style.display = '';
            playbackStatus.textContent = 'PLAY';
            playbackStatus.classList.add('visible');
        }
        resetHideTimer();
    }

    // Skip
    skipBackBtn.addEventListener('click', () => {
        if (!videoLoaded) return;
        video.currentTime = Math.max(0, video.currentTime - 10);
        showToast('−10s');
    });

    skipForwardBtn.addEventListener('click', () => {
        if (!videoLoaded) return;
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
        showToast('+10s');
    });

    // Time display
    video.addEventListener('timeupdate', () => {
        updateTimeDisplay();
        updateSeekBar();
        highlightNearestSnap();
        // Throttled save of position
        throttledSavePosition();
    });

    video.addEventListener('loadedmetadata', updateTimeDisplay);

    function updateTimeDisplay() {
        const cur = formatTime(video.currentTime);
        const dur = formatTime(video.duration);
        timeDisplay.textContent = `${cur} / ${dur}`;
    }

    // ─── Seek Bar ───
    function updateSeekBar() {
        if (isSeeking) return;
        const pct = (video.currentTime / video.duration) * 100 || 0;
        seekBarFill.style.width = pct + '%';
        seekBarThumb.style.left = pct + '%';

        // Buffered
        if (video.buffered.length > 0) {
            const buffEnd = video.buffered.end(video.buffered.length - 1);
            seekBarBuffered.style.width = (buffEnd / video.duration * 100) + '%';
        }
    }

    // Seek interactions
    seekContainer.addEventListener('mousedown', startSeek);
    seekContainer.addEventListener('mousemove', updateSeekTooltip);

    function startSeek(e) {
        if (!videoLoaded) return;
        isSeeking = true;
        updateSeekFromMouse(e);

        const onMove = (e) => updateSeekFromMouse(e);
        const onUp = () => {
            isSeeking = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            saveSnapInfo();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function updateSeekFromMouse(e) {
        const rect = seekBarTrack.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        video.currentTime = pct * video.duration;

        seekBarFill.style.width = (pct * 100) + '%';
        seekBarThumb.style.left = (pct * 100) + '%';
    }

    function updateSeekTooltip(e) {
        if (!videoLoaded) return;
        const rect = seekBarTrack.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        const time = pct * video.duration;
        seekTooltip.textContent = formatTime(time);
        seekTooltip.style.left = (pct * 100) + '%';
    }

    // ─── Speed Selector ───
    speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSpeedMenu();
    });

    speedMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-speed]');
        if (!btn) return;
        const speed = parseFloat(btn.dataset.speed);
        setSpeed(speed);
        closeSpeedMenu();
    });

    function toggleSpeedMenu() {
        speedMenuOpen = !speedMenuOpen;
        speedMenu.classList.toggle('visible', speedMenuOpen);
    }

    function closeSpeedMenu() {
        speedMenuOpen = false;
        speedMenu.classList.remove('visible');
    }

    function setSpeed(speed) {
        currentSpeed = speed;
        video.playbackRate = speed;
        speedBtn.textContent = speed === 1 ? '1x' : speed + 'x';

        // Update active state
        speedMenu.querySelectorAll('button').forEach(b => {
            b.classList.toggle('active', parseFloat(b.dataset.speed) === speed);
        });

        saveSnapInfo();
    }

    // Close speed menu on outside click
    document.addEventListener('click', (e) => {
        if (!speedMenu.contains(e.target) && e.target !== speedBtn) {
            closeSpeedMenu();
        }
    });

    // ─── Autoplay Toggle ───
    autoplayCheckbox.addEventListener('change', () => {
        autoplayOnJump = autoplayCheckbox.checked;
        saveSnapInfo();
    });

    // ═══════════════════════════════════════════
    // SNAP SYSTEM
    // ═══════════════════════════════════════════

    snapBtn.addEventListener('click', openSnapModal);

    function openSnapModal() {
        if (!videoLoaded) return;
        video.pause();
        isModalOpen = true;

        // Set timestamp
        modalTimestamp.textContent = formatTime(video.currentTime);
        snapNameInput.value = '';
        snapModal.classList.add('visible');
        hideAllOverlays();

        // Focus input after animation
        setTimeout(() => snapNameInput.focus(), 100);
    }

    function closeSnapModal() {
        isModalOpen = false;
        snapModal.classList.remove('visible');
    }

    modalCancelBtn.addEventListener('click', closeSnapModal);

    modalSnapBtn.addEventListener('click', saveCurrentSnap);

    snapNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveCurrentSnap();
        }
        if (e.key === 'Escape') {
            closeSnapModal();
        }
    });

    // Close modal on overlay click
    snapModal.addEventListener('click', (e) => {
        if (e.target === snapModal) closeSnapModal();
    });

    function saveCurrentSnap() {
        const name = snapNameInput.value.trim();
        if (!name) {
            snapNameInput.focus();
            snapNameInput.style.borderColor = '#ff5555';
            setTimeout(() => snapNameInput.style.borderColor = '', 1000);
            return;
        }

        const snap = {
            id: generateId(),
            timestamp: video.currentTime,
            name: name
        };

        snaps.push(snap);
        snaps.sort((a, b) => a.timestamp - b.timestamp);

        renderSnaps();
        closeSnapModal();
        saveSnapInfo();
        showToast(`Snapped: ${name}`);
    }

    function renderSnaps() {
        snapCount.textContent = snaps.length;

        if (snaps.length === 0) {
            snapList.innerHTML = `
        <div class="snap-panel__empty">
          <p>No snaps yet</p>
          <p class="snap-panel__empty-hint">Click 📸 to bookmark a moment</p>
        </div>
      `;
            return;
        }

        snapList.innerHTML = snaps.map(snap => `
      <div class="snap-item" data-id="${snap.id}" data-timestamp="${snap.timestamp}">
        <span class="snap-item__time">${formatTime(snap.timestamp)}</span>
        <span class="snap-item__name">${escapeHtml(snap.name)}</span>
        <button class="snap-item__delete" title="Delete snap" data-delete="${snap.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join('');

        // Attach click handlers
        snapList.querySelectorAll('.snap-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.snap-item__delete')) return;
                const ts = parseFloat(el.dataset.timestamp);
                jumpToSnap(ts);
            });
        });

        snapList.querySelectorAll('.snap-item__delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteSnap(btn.dataset.delete);
            });
        });

        highlightNearestSnap();
    }

    function jumpToSnap(timestamp) {
        video.currentTime = timestamp;
        if (autoplayOnJump) {
            video.play();
        }
        highlightNearestSnap();
        saveSnapInfo();
    }

    function deleteSnap(id) {
        snaps = snaps.filter(s => s.id !== id);
        renderSnaps();
        saveSnapInfo();
    }

    function highlightNearestSnap() {
        if (snaps.length === 0) return;

        const curTime = video.currentTime;
        let nearestIdx = 0;
        let minDist = Infinity;

        snaps.forEach((snap, i) => {
            const dist = Math.abs(snap.timestamp - curTime);
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = i;
            }
        });

        const items = snapList.querySelectorAll('.snap-item');
        items.forEach((el, i) => {
            el.classList.toggle('active', i === nearestIdx);
        });

        // Auto-scroll to center the nearest snap
        const activeItem = items[nearestIdx];
        if (activeItem && isLeftVisible) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ═══════════════════════════════════════════
    // PERSISTENCE (.snapinfo)
    // ═══════════════════════════════════════════

    let saveTimeout = null;

    function throttledSavePosition() {
        if (saveTimeout) return;
        saveTimeout = setTimeout(() => {
            saveTimeout = null;
            saveSnapInfo();
        }, 5000); // Save position every 5 seconds
    }

    async function saveSnapInfo() {
        if (!fileName) return;

        const data = {
            version: 1,
            lastPosition: video.currentTime || 0,
            autoplay: autoplayOnJump,
            playbackSpeed: currentSpeed,
            snaps: snaps.map(s => ({
                id: s.id,
                timestamp: s.timestamp,
                name: s.name
            }))
        };

        // Try File System Access API if directory is set
        if (dirHandle) {
            try {
                // Request/Verify permission (re-activates stored handle)
                const permission = await verifyPermission(dirHandle, true);
                if (permission) {
                    await saveViaFSAPI(data);
                    return; // Success
                }
            } catch (err) {
                console.warn('FS API save failed, falling back to localStorage:', err);
            }
        }

        // Fallback: localStorage
        try {
            localStorage.setItem(`snapinfo:${fileName}`, JSON.stringify(data));
        } catch (err) {
            console.warn('localStorage save failed:', err);
        }
    }

    async function verifyPermission(handle, readWrite) {
        const options = {};
        if (readWrite) options.mode = 'readwrite';
        // silent check
        if ((await handle.queryPermission(options)) === 'granted') return true;
        // interactive prompt (required by browser on first access per session)
        if ((await handle.requestPermission(options)) === 'granted') return true;
        return false;
    }

    async function saveViaFSAPI(data) {
        if (!dirHandle) return;
        const snapFileName = '.' + fileName + '.snapinfo';
        const snapFileHandle = await dirHandle.getFileHandle(snapFileName, { create: true });
        const writable = await snapFileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    }

    async function loadSnapInfo() {
        if (!fileName) return;

        let data = null;

        // Try FS API if we have a directory handle
        if (dirHandle) {
            try {
                // Check if we already have permission (no prompt)
                if ((await dirHandle.queryPermission()) === 'granted') {
                    data = await loadViaFSAPI();
                }
            } catch (err) {
                console.log('No .snapinfo via FS API for this video yet');
            }
        }

        // Fallback to localStorage if FS failed or wasn't available
        if (!data) {
            try {
                const stored = localStorage.getItem(`snapinfo:${fileName}`);
                if (stored) data = JSON.parse(stored);
            } catch (err) {
                console.warn('localStorage load failed:', err);
            }
        }

        if (data) {
            applySnapInfo(data);
        }
    }

    async function loadViaFSAPI() {
        const snapFileName = '.' + fileName + '.snapinfo';
        const snapFileHandle = await dirHandle.getFileHandle(snapFileName);
        const file = await snapFileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    }

    function applySnapInfo(data) {
        if (data.lastPosition && data.lastPosition > 0) {
            video.currentTime = data.lastPosition;
        }
        if (data.autoplay !== undefined) {
            autoplayOnJump = data.autoplay;
            autoplayCheckbox.checked = autoplayOnJump;
        }
        if (data.playbackSpeed) {
            setSpeed(data.playbackSpeed);
        }
        if (data.snaps && data.snaps.length > 0) {
            snaps = data.snaps.map(s => ({
                id: s.id || generateId(),
                timestamp: s.timestamp,
                name: s.name
            }));
            snaps.sort((a, b) => a.timestamp - b.timestamp);
            renderSnaps();
        }
    }

    // Save on page unload
    window.addEventListener('beforeunload', () => {
        if (videoLoaded && fileName) {
            // Synchronous localStorage save
            const data = {
                version: 1,
                lastPosition: video.currentTime || 0,
                autoplay: autoplayOnJump,
                playbackSpeed: currentSpeed,
                snaps: snaps.map(s => ({ id: s.id, timestamp: s.timestamp, name: s.name }))
            };
            try {
                localStorage.setItem(`snapinfo:${fileName}`, JSON.stringify(data));
            } catch (e) { }
        }
    });

    // ═══════════════════════════════════════════
    // KEYBOARD SHORTCUTS
    // ═══════════════════════════════════════════

    document.addEventListener('keydown', (e) => {
        // Don't capture when typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (videoLoaded) {
                    video.currentTime = Math.max(0, video.currentTime - 10);
                    showToast('−10s');
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (videoLoaded) {
                    video.currentTime = Math.min(video.duration, video.currentTime + 10);
                    showToast('+10s');
                }
                break;
            case 'KeyS':
                e.preventDefault();
                if (videoLoaded && !isModalOpen) openSnapModal();
                break;
            case 'Escape':
                if (isModalOpen) closeSnapModal();
                if (speedMenuOpen) closeSpeedMenu();
                hideAllOverlays();
                break;
            case 'KeyF':
                e.preventDefault();
                toggleFullscreen();
                break;
        }
    });

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    // Fullscreen button
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    document.addEventListener('fullscreenchange', () => {
        const isFs = !!document.fullscreenElement;
        fsExpandIcon.style.display = isFs ? 'none' : '';
        fsCompressIcon.style.display = isFs ? '' : 'none';
    });

    // ═══════════════════════════════════════════
    // TOAST NOTIFICATIONS
    // ═══════════════════════════════════════════

    let toastEl = null;
    let toastTimer = null;

    function showToast(message) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'toast';
            document.body.appendChild(toastEl);
        }

        toastEl.textContent = message;
        toastEl.classList.add('visible');

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('visible');
        }, 1200);
    }

    // ═══════════════════════════════════════════
    // DOUBLE-CLICK TO PLAY/PAUSE ON VIDEO
    // ═══════════════════════════════════════════

    video.addEventListener('click', (e) => {
        e.preventDefault();
        togglePlayPause();
    });

    // Prevent context menu on video
    video.addEventListener('contextmenu', (e) => e.preventDefault());

    // ─── Init ───
    updatePlayPauseIcon();

})();
