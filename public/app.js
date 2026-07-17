// State variables
let currentStatus = {
    connected: false,
    channelName: null,
    guildName: null,
    currentSong: null,
    queue: [],
    paused: false,
    playing: false
};

// DOM Elements
const botStatusEl = document.getElementById('bot-status');
const statusTextEl = botStatusEl.querySelector('.status-text');
const vcDetailsPanel = document.getElementById('vc-details-panel');
const searchInput = document.getElementById('search-input');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const skipBtn = document.getElementById('skip-btn');
const stopBtn = document.getElementById('stop-btn');
const currentSongCard = document.getElementById('current-song-card');
const currentSongTitle = document.getElementById('current-song-title');
const currentSongStatus = document.getElementById('current-song-status');
const queueList = document.getElementById('queue-list');
const toastContainer = document.getElementById('toast-container');
const ownerSelect = document.getElementById('owner-select');
const customVcGroup = document.getElementById('custom-vc-group');
const customVcInput = document.getElementById('custom-vc-input');

// Loop, Shuffle, and Volume DOM Elements
const loopBtn = document.getElementById('loop-btn');
const shuffleBtn = document.getElementById('shuffle-btn');
const volumeSlider = document.getElementById('volume-slider');
const volumeVal = document.getElementById('volume-val');
const volumeIcon = document.getElementById('volume-icon');

let isDraggingVolume = false;

// Fetch owner list and populate select dropdown
async function fetchOwners() {
    try {
        const res = await fetch('/api/owners');
        if (!res.ok) throw new Error('Failed to fetch owners');
        const owners = await res.json();
        
        // Clear except first auto and custom options
        ownerSelect.innerHTML = `
            <option value="auto">Auto (Find Any Owner)</option>
            <option value="custom">Custom Voice Channel ID...</option>
        `;
        
        owners.forEach(owner => {
            const opt = document.createElement('option');
            opt.value = owner.id;
            opt.textContent = `${owner.username} (${owner.id})`;
            ownerSelect.appendChild(opt);
        });
    } catch (err) {
        console.error('Error fetching owners:', err);
    }
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Fetch owner list
    fetchOwners();

    // Poll status immediately and then every 1.5s
    pollStatus();
    setInterval(pollStatus, 1500);

    // Toggle custom VC input visibility based on dropdown selection
    ownerSelect.addEventListener('change', () => {
        if (ownerSelect.value === 'custom') {
            customVcGroup.classList.remove('hidden');
        } else {
            customVcGroup.classList.add('hidden');
        }
    });

    // Click event listeners for controls
    playBtn.addEventListener('click', handlePlay);
    pauseBtn.addEventListener('click', () => sendControl('pause', 'Playback paused'));
    resumeBtn.addEventListener('click', () => sendControl('resume', 'Playback resumed'));
    skipBtn.addEventListener('click', () => sendControl('skip', 'Skipped current song'));
    stopBtn.addEventListener('click', () => sendControl('stop', 'Stopped and disconnected'));

    // Loop control
    if (loopBtn) {
        loopBtn.addEventListener('click', handleLoopToggle);
    }

    // Shuffle control
    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => sendControl('shuffle', 'Queue shuffled'));
    }

    // Volume controls
    if (volumeSlider) {
        volumeSlider.addEventListener('mousedown', () => { isDraggingVolume = true; });
        volumeSlider.addEventListener('mouseup', () => { isDraggingVolume = false; });
        volumeSlider.addEventListener('touchstart', () => { isDraggingVolume = true; });
        volumeSlider.addEventListener('touchend', () => { isDraggingVolume = false; });
        volumeSlider.addEventListener('input', handleVolumeInput);
        volumeSlider.addEventListener('change', handleVolumeChange);
    }

    // Allow pressing Enter in search input
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handlePlay();
        }
    });
});

// Poll status from API
async function pollStatus() {
    try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error('API Error');
        const status = await res.json();
        
        // Update UI only if status has changed
        updateUI(status);
        currentStatus = status;
    } catch (err) {
        console.error('Failed to poll status:', err);
        updateUIOffline();
    }
}

// Update UI elements based on current status
function updateUI(status) {
    // 1. Connection Status Badge
    if (status.connected) {
        botStatusEl.className = 'status-badge online';
        statusTextEl.innerText = 'Connected';
    } else {
        botStatusEl.className = 'status-badge offline';
        statusTextEl.innerText = 'Disconnected';
    }

    // 2. Voice Connection Details Panel
    if (status.connected) {
        vcDetailsPanel.innerHTML = `
            <p class="vc-info-text">
                <i class="fa-solid fa-headphones text-accent"></i> 
                Connected to VC <span class="vc-channel-name">"${status.channelName || 'Unknown'}"</span> 
                in Guild <span class="vc-guild-name">"${status.guildName || 'Unknown'}"</span>
            </p>
        `;
    } else {
        vcDetailsPanel.innerHTML = `
            <p class="vc-info-text">
                <i class="fa-solid fa-signal text-accent"></i> 
                Not joined to any Voice Channel. Will auto-join owners on play.
            </p>
        `;
    }

    // 3. Play/Pause/Resume Button Toggles
    if (status.paused) {
        pauseBtn.classList.add('hidden');
        resumeBtn.classList.remove('hidden');
    } else {
        pauseBtn.classList.remove('hidden');
        resumeBtn.classList.add('hidden');
    }

    // 4. Now Playing Card Details
    if (status.currentSong) {
        currentSongCard.classList.add('active');
        
        let statusText = 'Streaming from YouTube...';
        if (status.paused) {
            statusText = 'Paused';
        } else if (status.currentSong.source === 'soundcloud') {
            statusText = 'Streaming from SoundCloud...';
        }

        currentSongCard.innerHTML = `
            <div class="song-info-fallback">
                <i class="fa-solid fa-compact-disc spin-disc"></i>
                <div class="fallback-details">
                    <h4 id="current-song-title" title="${status.currentSong.title}">${status.currentSong.title}</h4>
                    <p id="current-song-status">${statusText}</p>
                </div>
            </div>
        `;
    } else {
        currentSongCard.classList.remove('active');
        currentSongCard.innerHTML = `
            <div class="song-info-fallback">
                <i class="fa-solid fa-compact-disc spin-disc"></i>
                <div class="fallback-details">
                    <h4 id="current-song-title">No song playing</h4>
                    <p id="current-song-status">Ready to play your favorite tracks</p>
                </div>
            </div>
        `;
    }

    // 5. Render Play Queue (Lazy/Optimized rendering)
    renderQueue(status.queue);

    // 6. Update Loop button states
    if (loopBtn) {
        if (status.loopStatus === 'queue') {
            loopBtn.className = 'btn btn-secondary btn-loop-queue';
            loopBtn.querySelector('span').innerText = 'Loop: Queue';
            loopBtn.title = 'Loop Mode (Queue)';
        } else if (status.loopStatus === 'song') {
            loopBtn.className = 'btn btn-secondary btn-loop-song';
            loopBtn.querySelector('span').innerText = 'Loop: Song';
            loopBtn.title = 'Loop Mode (Song)';
        } else {
            loopBtn.className = 'btn btn-secondary';
            loopBtn.querySelector('span').innerText = 'Loop: Off';
            loopBtn.title = 'Loop Mode (Off)';
        }
    }

    // 7. Update Volume slider & text dynamically (if not dragging)
    if (volumeSlider && !isDraggingVolume) {
        const vol = status.volume !== undefined ? status.volume : 100;
        volumeSlider.value = vol;
        if (volumeVal) volumeVal.innerText = `${vol}%`;
        updateVolumeIcon(vol);
    }
}

// Set UI status as offline if API server is unreachable
function updateUIOffline() {
    botStatusEl.className = 'status-badge offline';
    statusTextEl.innerText = 'Server Offline';
    vcDetailsPanel.innerHTML = `
        <p class="vc-info-text">
            <i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i> 
            Cannot connect to the self-bot web server.
        </p>
    `;
    currentSongCard.classList.remove('active');
}

// Render queue list with lazy loading/batching to prevent lag
function renderQueue(queue) {
    if (!queue || queue.length <= 1) {
        queueList.innerHTML = '<li class="empty-queue-msg">The play queue is currently empty.</li>';
        return;
    }

    const upNext = queue.slice(1);
    
    // Efficiently batch HTML generation
    const queueHTML = upNext.map((song, idx) => {
        return `
            <li>
                <span class="song-title" title="${song.title}">${song.title}</span>
                <span class="song-position">#${idx + 1}</span>
            </li>
        `;
    }).join('');

    queueList.innerHTML = queueHTML;
}

// Handle Play action
async function handlePlay() {
    const query = searchInput.value.trim();
    if (!query) {
        showToast('Please enter a song name or link', 'danger');
        return;
    }

    const targetOwnerId = ownerSelect.value;
    const customVcId = customVcInput.value.trim();

    if (targetOwnerId === 'custom' && !customVcId) {
        showToast('Please enter a custom Voice Channel ID', 'danger');
        return;
    }

    searchInput.value = '';
    showToast(`Searching and queuing "${query}"...`, 'success');

    try {
        const res = await fetch('/api/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, targetOwnerId, customVcId })
        });
        
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Playback failed');
        }

        showToast(`Successfully queued: "${data.song.title}"`, 'success');
        pollStatus();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// Send standard control post request
async function sendControl(action, successMessage) {
    try {
        const res = await fetch(`/api/${action}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || `Control action "${action}" failed`);
        }
        showToast(successMessage, 'success');
        pollStatus();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// Helper to show modern floating toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-circle-check';
    if (type === 'danger') iconClass = 'fa-circle-xmark';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Auto remove toast
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, 4000);
}

// Loop toggling helper (none -> queue -> song -> none)
async function handleLoopToggle() {
    let nextMode = 'none';
    if (currentStatus.loopStatus === 'none') {
        nextMode = 'queue';
    } else if (currentStatus.loopStatus === 'queue') {
        nextMode = 'song';
    } else {
        nextMode = 'none';
    }

    try {
        const res = await fetch('/api/loop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: nextMode })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update loop mode');
        
        let label = 'Off';
        if (nextMode === 'queue') label = 'Queue';
        if (nextMode === 'song') label = 'Song';
        showToast(`Loop mode set to: ${label}`, 'success');
        pollStatus();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// Local UI updates when sliding volume slider (fast/smooth)
function handleVolumeInput() {
    const value = volumeSlider.value;
    if (volumeVal) volumeVal.innerText = `${value}%`;
    updateVolumeIcon(value);
}

// Update the speaker icon class based on level
function updateVolumeIcon(value) {
    if (!volumeIcon) return;
    volumeIcon.className = 'fa-solid';
    if (value == 0) {
        volumeIcon.classList.add('fa-volume-xmark');
    } else if (value < 40) {
        volumeIcon.classList.add('fa-volume-off');
    } else if (value < 85) {
        volumeIcon.classList.add('fa-volume-low');
    } else {
        volumeIcon.classList.add('fa-volume-high');
    }
}

// Throttle/debounce helper for sending volume requests
let volumeTimeout = null;

// Send volume POST request when changed
function handleVolumeChange() {
    const value = parseInt(volumeSlider.value, 10);
    
    // Clear any pending debounce requests
    if (volumeTimeout) clearTimeout(volumeTimeout);
    
    // Debounce send request by 100ms so we don't block/spam express
    volumeTimeout = setTimeout(async () => {
        try {
            const res = await fetch('/api/volume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ volume: value })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update volume');
        } catch (err) {
            showToast(err.message, 'danger');
        }
    }, 100);
}
