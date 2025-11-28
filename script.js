// Core elements
const fileInput = document.getElementById('file-input');
const audioPlayer = document.getElementById('audio-player');
const playlist = document.getElementById('playlist');
const trackTitle = document.getElementById('track-title');
const trackTime = document.getElementById('track-time');
const progressBar = document.getElementById('progress-bar');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const playPauseBtn = document.getElementById('play-pause-btn');
const playPauseIcon = document.getElementById('play-pause-icon');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const shuffleBtn = document.getElementById('shuffle-btn');
const repeatBtn = document.getElementById('repeat-btn');

// State management
let playlistItems = [];
let currentTrackIndex = -1;
let isShuffleMode = false;
let repeatMode = 'off'; // 'off', 'all', 'one'
let shuffleHistory = [];
let isPlaying = false;

// Initialize audio player
audioPlayer.volume = 1.0;

// IndexedDB setup for storing files
// Based on MDN IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
const DB_NAME = 'MediaPlayerDB';
const DB_VERSION = 1;
const STORE_NAME = 'audioFiles';
let db = null;

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Save file to IndexedDB
// Based on MDN: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/put
async function saveFileToDB(file, name, duration) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const fileData = {
                name: name,
                type: file.type,
                data: event.target.result,
                duration: duration,
                lastModified: file.lastModified
            };
            
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(fileData);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

// Load all files from IndexedDB
// Based on MDN: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAll
async function loadFilesFromDB() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Clear all files from IndexedDB
async function clearFilesFromDB() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Save player state to localStorage
// Based on MDN Web Storage API: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
function savePlayerState() {
    const state = {
        currentTrackIndex: currentTrackIndex,
        volume: audioPlayer.volume,
        isShuffleMode: isShuffleMode,
        repeatMode: repeatMode,
        currentTime: audioPlayer.currentTime
    };
    localStorage.setItem('playerState', JSON.stringify(state));
}

// Load player state from localStorage
function loadPlayerState() {
    const saved = localStorage.getItem('playerState');
    if (saved) {
        const state = JSON.parse(saved);
        currentTrackIndex = state.currentTrackIndex || -1;
        audioPlayer.volume = state.volume !== undefined ? state.volume : 1.0;
        volumeSlider.value = (state.volume !== undefined ? state.volume : 1.0) * 100;
        volumeValue.textContent = `${Math.round(volumeSlider.value)}%`;
        isShuffleMode = state.isShuffleMode || false;
        repeatMode = state.repeatMode || 'off';
        
        if (isShuffleMode) {
            shuffleBtn.classList.add('active');
        }
        
        if (repeatMode === 'all') {
            repeatBtn.classList.add('active');
            repeatBtn.title = 'Repeat All';
        } else if (repeatMode === 'one') {
            repeatBtn.title = 'Repeat One';
        }
        
        return state;
    }
    return null;
}

// Restore playlist from IndexedDB on page load
async function restorePlaylist() {
    try {
        const savedFiles = await loadFilesFromDB();
        
        if (savedFiles.length === 0) return;
        
        for (const fileData of savedFiles) {
            const blob = new Blob([fileData.data], { type: fileData.type });
            const url = URL.createObjectURL(blob);
            
            const playlistItem = {
                name: fileData.name,
                file: blob,
                url: url,
                duration: fileData.duration || 0
            };
            
            // Get duration if not saved
            if (!playlistItem.duration) {
                const audio = new Audio(url);
                audio.addEventListener('loadedmetadata', () => {
                    playlistItem.duration = audio.duration;
                    updatePlaylistDisplay();
                });
            }
            
            playlistItems.push(playlistItem);
        }
        
        updatePlaylistDisplay();
        
        // Restore player state
        const state = loadPlayerState();
        if (state && currentTrackIndex >= 0 && currentTrackIndex < playlistItems.length) {
            loadTrack(currentTrackIndex);
            if (state.currentTime) {
                audioPlayer.currentTime = state.currentTime;
            }
        }
    } catch (error) {
        console.error('Error restoring playlist:', error);
    }
}

// File input handling
fileInput.addEventListener('change', handleFileSelection);

async function handleFileSelection(event) {
    // Prevent default behavior to avoid page reload on mobile
    // Based on MDN Event.preventDefault(): https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault
    event.preventDefault();
    
    const files = Array.from(event.target.files);
    
    if (files.length === 0) return;
    
    // Store the current playing state and time before adding files
    const wasPlaying = isPlaying;
    const currentTime = audioPlayer.currentTime;
    const wasLoaded = currentTrackIndex !== -1;
    
    for (const file of files) {
        // Check file type - on mobile, file.type might be empty, so also check file extension
        // Based on MDN File API: https://developer.mozilla.org/en-US/docs/Web/API/File
        const isAudioFile = file.type.startsWith('audio/') || 
                           /\.(mp3|wav|ogg|aac|m4a|flac|webm|opus)$/i.test(file.name);
        
        if (isAudioFile) {
            const url = URL.createObjectURL(file);
            const playlistItem = {
                name: file.name,
                file: file,
                url: url,
                duration: 0
            };
            
            // Get duration
            const audio = new Audio(url);
            audio.addEventListener('loadedmetadata', async () => {
                playlistItem.duration = audio.duration;
                updatePlaylistDisplay();
                // Save file to IndexedDB after duration is loaded
                try {
                    await saveFileToDB(file, file.name, audio.duration);
                } catch (error) {
                    console.error('Error saving file to database:', error);
                }
            });
            
            playlistItems.push(playlistItem);
        }
    }
    
    // Update display immediately so files show up right away on mobile
    updatePlaylistDisplay();
    savePlayerState();
    
    // Auto-play first track only if no track is currently selected
    // Don't reload if a track is already playing
    if (currentTrackIndex === -1 && playlistItems.length > 0) {
        currentTrackIndex = 0;
        loadTrack(0);
    } else if (wasLoaded && wasPlaying) {
        // Restore playback state if a track was playing
        audioPlayer.currentTime = currentTime;
        if (wasPlaying) {
            playTrack();
        }
    }
    
    // Clear the file input value after a short delay to prevent issues on mobile
    // This allows the same file to be selected again if needed
    // Based on MDN: https://developer.mozilla.org/en-US/docs/Web/API/setTimeout
    setTimeout(() => {
        event.target.value = '';
    }, 100);
}

// Playlist management
function updatePlaylistDisplay() {
    if (playlistItems.length === 0) {
        playlist.innerHTML = '<p class="empty-playlist">No files added yet. Click "Browse Files" to add audio files.</p>';
        return;
    }
    
    playlist.innerHTML = '';
    
    playlistItems.forEach((item, index) => {
        const playlistItem = document.createElement('div');
        playlistItem.className = 'playlist-item';
        if (index === currentTrackIndex) {
            playlistItem.classList.add('active');
        }
        
        playlistItem.innerHTML = `
            <span class="playlist-item-number">${index + 1}</span>
            <span class="playlist-item-name">${item.name}</span>
            <span class="playlist-item-duration">${formatTime(item.duration)}</span>
        `;
        
        playlistItem.addEventListener('click', () => {
            currentTrackIndex = index;
            loadTrack(index);
            playTrack();
        });
        
        playlist.appendChild(playlistItem);
    });
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds === 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Track loading and playback
function loadTrack(index) {
    if (index < 0 || index >= playlistItems.length) return;
    
    currentTrackIndex = index;
    const track = playlistItems[index];
    
    audioPlayer.src = track.url;
    trackTitle.textContent = track.name;
    updatePlaylistDisplay();
    
    audioPlayer.load();
    savePlayerState();
}

function playTrack() {
    if (currentTrackIndex === -1 || playlistItems.length === 0) return;
    
    audioPlayer.play()
        .then(() => {
            isPlaying = true;
            playPauseIcon.textContent = '⏸';
        })
        .catch(error => {
            console.error('Error playing audio:', error);
        });
}

function pauseTrack() {
    audioPlayer.pause();
    isPlaying = false;
    playPauseIcon.textContent = '▶';
}

// Playback controls
playPauseBtn.addEventListener('click', () => {
    if (currentTrackIndex === -1 && playlistItems.length > 0) {
        currentTrackIndex = 0;
        loadTrack(0);
    }
    
    if (isPlaying) {
        pauseTrack();
    } else {
        playTrack();
    }
});

prevBtn.addEventListener('click', () => {
    if (playlistItems.length === 0) return;
    
    if (isShuffleMode) {
        playRandomTrack();
    } else {
        let newIndex = currentTrackIndex - 1;
        if (newIndex < 0) {
            newIndex = playlistItems.length - 1;
        }
        currentTrackIndex = newIndex;
        loadTrack(newIndex);
        playTrack();
    }
});

nextBtn.addEventListener('click', () => {
    if (playlistItems.length === 0) return;
    
    if (isShuffleMode) {
        playRandomTrack();
    } else {
        handleNextTrack();
    }
});

function handleNextTrack() {
    if (repeatMode === 'one') {
        audioPlayer.currentTime = 0;
        playTrack();
        return;
    }
    
    let newIndex = currentTrackIndex + 1;
    
    if (newIndex >= playlistItems.length) {
        if (repeatMode === 'all') {
            newIndex = 0;
        } else {
            pauseTrack();
            return;
        }
    }
    
    currentTrackIndex = newIndex;
    loadTrack(newIndex);
    playTrack();
}

// Progress bar - throttle state saving
let lastSaveTime = 0;
const SAVE_INTERVAL = 2000; // Save every 2 seconds

audioPlayer.addEventListener('timeupdate', () => {
    if (audioPlayer.duration) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBar.value = progress;
        trackTime.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
    }
    // Save state periodically
    const now = Date.now();
    if (now - lastSaveTime >= SAVE_INTERVAL) {
        savePlayerState();
        lastSaveTime = now;
    }
});

progressBar.addEventListener('input', () => {
    if (audioPlayer.duration) {
        const seekTime = (progressBar.value / 100) * audioPlayer.duration;
        audioPlayer.currentTime = seekTime;
    }
});

// Volume control
volumeSlider.addEventListener('input', () => {
    const volume = volumeSlider.value / 100;
    audioPlayer.volume = volume;
    volumeValue.textContent = `${volumeSlider.value}%`;
    savePlayerState();
});

// Shuffle mode
shuffleBtn.addEventListener('click', () => {
    isShuffleMode = !isShuffleMode;
    shuffleBtn.classList.toggle('active', isShuffleMode);
    
    if (isShuffleMode) {
        shuffleHistory = [];
        if (currentTrackIndex !== -1) {
            shuffleHistory.push(currentTrackIndex);
        }
    }
    savePlayerState();
});

function playRandomTrack() {
    if (playlistItems.length === 0) return;
    
    if (playlistItems.length === 1) {
        currentTrackIndex = 0;
        loadTrack(0);
        playTrack();
        return;
    }
    
    let randomIndex;
    do {
        randomIndex = Math.floor(Math.random() * playlistItems.length);
    } while (randomIndex === currentTrackIndex && playlistItems.length > 1);
    
    // Avoid immediate repeats
    if (shuffleHistory.length > 0 && shuffleHistory[shuffleHistory.length - 1] === randomIndex) {
        if (playlistItems.length > 2) {
            do {
                randomIndex = Math.floor(Math.random() * playlistItems.length);
            } while (randomIndex === currentTrackIndex || randomIndex === shuffleHistory[shuffleHistory.length - 1]);
        }
    }
    
    shuffleHistory.push(randomIndex);
    if (shuffleHistory.length > playlistItems.length) {
        shuffleHistory.shift();
    }
    
    currentTrackIndex = randomIndex;
    loadTrack(randomIndex);
    playTrack();
}

// Repeat mode
repeatBtn.addEventListener('click', () => {
    if (repeatMode === 'off') {
        repeatMode = 'all';
        repeatBtn.classList.add('active');
        repeatBtn.title = 'Repeat All';
    } else if (repeatMode === 'all') {
        repeatMode = 'one';
        repeatBtn.title = 'Repeat One';
    } else {
        repeatMode = 'off';
        repeatBtn.classList.remove('active');
        repeatBtn.title = 'Repeat';
    }
    savePlayerState();
});

// Audio player events
audioPlayer.addEventListener('ended', () => {
    if (repeatMode === 'one') {
        audioPlayer.currentTime = 0;
        playTrack();
    } else if (repeatMode === 'all') {
        handleNextTrack();
    } else {
        handleNextTrack();
    }
});

audioPlayer.addEventListener('loadedmetadata', () => {
    progressBar.value = 0;
    trackTime.textContent = `00:00 / ${formatTime(audioPlayer.duration)}`;
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'INPUT') return;
    
    switch(event.code) {
        case 'Space':
            event.preventDefault();
            playPauseBtn.click();
            break;
        case 'ArrowLeft':
            event.preventDefault();
            prevBtn.click();
            break;
        case 'ArrowRight':
            event.preventDefault();
            nextBtn.click();
            break;
    }
});

// Initialize database and restore playlist on page load
// Based on MDN: https://developer.mozilla.org/en-US/docs/Web/API/Window/load_event
window.addEventListener('load', async () => {
    try {
        await initDB();
        await restorePlaylist();
    } catch (error) {
        console.error('Error initializing database:', error);
    }
});

// Save state before page unload
// Based on MDN: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
window.addEventListener('beforeunload', () => {
    savePlayerState();
});

