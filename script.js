// Core elements
const fileInput = document.getElementById('file-input');
const streamBtn = document.getElementById('stream-btn');
const audioPlayer = document.getElementById('audio-player');
const videoPlayer = document.getElementById('video-player');
const videoContainer = document.getElementById('video-container');
const fullscreenBtn = document.getElementById('fullscreen-btn');
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

// Fullscreen controls
const fullscreenControls = document.getElementById('fullscreen-controls');
const fullscreenProgressBar = document.getElementById('fullscreen-progress-bar');
const fullscreenTrackTime = document.getElementById('fullscreen-track-time');
const fullscreenPlayPauseBtn = document.getElementById('fullscreen-play-pause-btn');
const fullscreenPlayPauseIcon = document.getElementById('fullscreen-play-pause-icon');
const fullscreenPrevBtn = document.getElementById('fullscreen-prev-btn');
const fullscreenNextBtn = document.getElementById('fullscreen-next-btn');
const fullscreenVolumeSlider = document.getElementById('fullscreen-volume-slider');
const fullscreenVolumeValue = document.getElementById('fullscreen-volume-value');

// State management
let playlistItems = [];
let currentTrackIndex = -1;
let isShuffleMode = false;
let repeatMode = 'off'; // 'off', 'all', 'one'
let shuffleHistory = [];
let isPlaying = false;
let currentPlayer = audioPlayer; // Track which player is active (audio or video)

// Initialize players
audioPlayer.volume = 1.0;
videoPlayer.volume = 1.0;

// IndexedDB setup for storing files
// Based on MDN IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
const DB_NAME = 'MediaPlayerDB';
const DB_VERSION = 2; // Incremented to support video files
const STORE_NAME = 'mediaFiles';
const OLD_STORE_NAME = 'audioFiles'; // Legacy store name
let db = null;

// Helper function to determine if a file is video
function isVideoFile(type, name) {
    return type.startsWith('video/') || /\.(mp4|webm|ogg|ogv|mov|avi|mkv|m4v)$/i.test(name);
}

// Helper function to determine if a file is audio
function isAudioFile(type, name) {
    return type.startsWith('audio/') || /\.(mp3|wav|ogg|aac|m4a|flac|webm|opus)$/i.test(name);
}

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
            const transaction = event.target.transaction;

            console.log('Database upgrade from version', event.oldVersion, 'to', event.newVersion);

            // Migrate from old store to new store (v1 to v2)
            if (event.oldVersion < 2) {
                // Step 1: Create new mediaFiles store first
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    console.log('Created new store:', STORE_NAME);
                }

                // Step 2: If old store exists, migrate data
                if (database.objectStoreNames.contains(OLD_STORE_NAME)) {
                    console.log('Found old store, migrating data...');
                    const oldStore = transaction.objectStore(OLD_STORE_NAME);
                    const newStore = transaction.objectStore(STORE_NAME);
                    const getAllRequest = oldStore.getAll();

                    getAllRequest.onsuccess = () => {
                        const oldData = getAllRequest.result;
                        console.log('Migrating', oldData.length, 'items from old database');

                        oldData.forEach(data => {
                            // Add mediaType field if missing (default to audio for old data)
                            if (!data.mediaType) {
                                data.mediaType = 'audio';
                            }
                            // Copy to new store (without the id since it's auto-increment)
                            const { id, ...dataWithoutId } = data;
                            newStore.add(dataWithoutId);
                        });

                        console.log('Migration complete');
                    };

                    getAllRequest.onerror = () => {
                        console.error('Error reading old data:', getAllRequest.error);
                    };

                    // Step 3: Delete old store
                    database.deleteObjectStore(OLD_STORE_NAME);
                    console.log('Deleted old store:', OLD_STORE_NAME);
                }
            }
        };
    });
}

// Save file to IndexedDB
// Based on MDN: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/put
async function saveFileToDB(file, name, duration, streamUrl = null, mediaType = 'audio') {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
        // If streamUrl is provided, save stream URL instead of file data
        if (streamUrl) {
            const fileData = {
                name: name,
                streamUrl: streamUrl,
                duration: duration,
                type: 'audio/mpeg', // Default type for stream URLs
                mediaType: mediaType
            };

            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(fileData);

            request.onsuccess = () => {
                console.log('Saved stream URL to IndexedDB:', name, 'ID:', request.result);
                resolve(request.result);
            };
            request.onerror = () => {
                console.error('Error saving stream URL to IndexedDB:', request.error);
                reject(request.error);
            };
        } else {
            // Save local file
            const reader = new FileReader();
            reader.onload = (event) => {
                const fileData = {
                    name: name,
                    type: file.type,
                    data: event.target.result,
                    duration: duration,
                    lastModified: file.lastModified,
                    mediaType: mediaType
                };

                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.add(fileData);

                request.onsuccess = () => {
                    console.log('Saved file to IndexedDB:', name, 'ID:', request.result);
                    resolve(request.result);
                };
                request.onerror = () => {
                    console.error('Error saving file to IndexedDB:', request.error);
                    reject(request.error);
                };
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        }
    });
}

// Delete file from IndexedDB
// Based on MDN: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/delete
async function deleteFileFromDB(id) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
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

        request.onsuccess = () => {
            console.log('Loaded', request.result.length, 'files from IndexedDB');
            resolve(request.result);
        };
        request.onerror = () => {
            console.error('Error loading files from IndexedDB:', request.error);
            reject(request.error);
        };
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
        videoPlayer.volume = state.volume !== undefined ? state.volume : 1.0;
        volumeSlider.value = (state.volume !== undefined ? state.volume : 1.0) * 100;
        volumeValue.textContent = `${Math.round(volumeSlider.value)}%`;
        // Sync fullscreen volume slider
        fullscreenVolumeSlider.value = volumeSlider.value;
        fullscreenVolumeValue.textContent = `${Math.round(volumeSlider.value)}%`;
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
        console.log('Restoring playlist from IndexedDB...');
        const savedFiles = await loadFilesFromDB();

        if (savedFiles.length === 0) {
            console.log('No saved files found');
            return;
        }

        console.log('Restoring', savedFiles.length, 'files...');
        
        for (const fileData of savedFiles) {
            // Determine media type (default to audio for backwards compatibility)
            const mediaType = fileData.mediaType || 'audio';

            // Check if this is a stream URL or a local file
            if (fileData.streamUrl) {
                // Restore stream URL
                const playlistItem = {
                    id: fileData.id,
                    name: fileData.name,
                    file: null,
                    url: fileData.streamUrl,
                    duration: fileData.duration || 0,
                    mediaType: mediaType
                };

                // Get duration if not saved
                if (!playlistItem.duration) {
                    const media = mediaType === 'video' ? document.createElement('video') : new Audio();
                    media.src = fileData.streamUrl;
                    media.addEventListener('loadedmetadata', () => {
                        playlistItem.duration = media.duration;
                        updatePlaylistDisplay();
                    });
                    media.addEventListener('error', (e) => {
                        console.error('Error loading stream URL:', e);
                        updatePlaylistDisplay();
                    });
                    media.load();
                }

                playlistItems.push(playlistItem);
            } else {
                // Restore local file
                const blob = new Blob([fileData.data], { type: fileData.type });
                const url = URL.createObjectURL(blob);

                const playlistItem = {
                    id: fileData.id,
                    name: fileData.name,
                    file: blob,
                    url: url,
                    duration: fileData.duration || 0,
                    mediaType: mediaType
                };

                // Get duration if not saved
                if (!playlistItem.duration) {
                    const media = mediaType === 'video' ? document.createElement('video') : new Audio();
                    media.src = url;
                    media.addEventListener('loadedmetadata', () => {
                        playlistItem.duration = media.duration;
                        updatePlaylistDisplay();
                    });
                }

                playlistItems.push(playlistItem);
            }
        }
        
        updatePlaylistDisplay();

        console.log('Playlist restored successfully. Total items:', playlistItems.length);

        // Restore player state
        const state = loadPlayerState();
        if (state && currentTrackIndex >= 0 && currentTrackIndex < playlistItems.length) {
            loadTrack(currentTrackIndex);
            if (state.currentTime) {
                currentPlayer.currentTime = state.currentTime;
            }
        }
    } catch (error) {
        console.error('Error restoring playlist:', error);
    }
}

// File input handling
fileInput.addEventListener('change', handleFileSelection);

// Stream URL handling
// Based on MDN Window.prompt(): https://developer.mozilla.org/en-US/docs/Web/API/Window/prompt
streamBtn.addEventListener('click', () => {
    const url = window.prompt('Enter media stream URL (audio/video):');
    if (url && url.trim()) {
        addStreamUrl(url.trim());
    }
});

// Add stream URL to playlist
// Based on MDN HTMLAudioElement: https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement
function addStreamUrl(url) {
    // Basic URL validation
    try {
        new URL(url);
    } catch (error) {
        alert('Invalid URL. Please enter a valid URL.');
        return;
    }

    // Detect if URL is likely a video stream based on extension
    const isVideo = /\.(mp4|webm|ogv|mov|m4v)(\?|$)/i.test(url) || url.includes('video');
    const mediaType = isVideo ? 'video' : 'audio';

    // Store the current playing state and time before adding stream
    const wasPlaying = isPlaying;
    const currentTime = currentPlayer.currentTime;
    const wasLoaded = currentTrackIndex !== -1;

    // Create playlist item for stream URL
    const playlistItem = {
        name: url, // Use full URL as name
        file: null, // Not a local file
        url: url, // Direct URL, not object URL
        duration: 0, // Will be loaded asynchronously
        id: undefined, // Not saved to IndexedDB
        mediaType: mediaType
    };

    // Load metadata (duration) asynchronously
    const media = isVideo ? document.createElement('video') : new Audio();
    media.src = url;
    media.addEventListener('loadedmetadata', async () => {
        playlistItem.duration = media.duration;
        updatePlaylistDisplay();
        // Save stream URL to IndexedDB after duration is loaded
        try {
            const dbId = await saveFileToDB(null, url, media.duration, url, mediaType);
            playlistItem.id = dbId;
        } catch (error) {
            console.error('Error saving stream URL to database:', error);
        }
    });

    // Handle errors (CORS, invalid media, etc.)
    media.addEventListener('error', async (e) => {
        console.error('Error loading stream URL:', e);
        // Still add to playlist, but duration will remain 0
        updatePlaylistDisplay();
        // Save stream URL to IndexedDB even if duration couldn't be loaded
        try {
            const dbId = await saveFileToDB(null, url, 0, url, mediaType);
            playlistItem.id = dbId;
        } catch (error) {
            console.error('Error saving stream URL to database:', error);
        }
    });

    // Preload the media to trigger metadata loading
    media.load();

    playlistItems.push(playlistItem);

    // Update display immediately
    updatePlaylistDisplay();
    savePlayerState();

    // Auto-play first track only if no track is currently selected
    // Don't reload if a track is already playing
    if (currentTrackIndex === -1 && playlistItems.length > 0) {
        currentTrackIndex = playlistItems.length - 1;
        loadTrack(currentTrackIndex);
    } else if (wasLoaded && wasPlaying) {
        // Restore playback state if a track was playing
        currentPlayer.currentTime = currentTime;
        if (wasPlaying) {
            playTrack();
        }
    }
}

async function handleFileSelection(event) {
    // Prevent default behavior to avoid page reload on mobile
    // Based on MDN Event.preventDefault(): https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault
    event.preventDefault();
    
    const files = Array.from(event.target.files);
    
    if (files.length === 0) return;
    
    // Store the current playing state and time before adding files
    const wasPlaying = isPlaying;
    const currentTime = currentPlayer.currentTime;
    const wasLoaded = currentTrackIndex !== -1;

    for (const file of files) {
        // Check file type - on mobile, file.type might be empty, so also check file extension
        // Based on MDN File API: https://developer.mozilla.org/en-US/docs/Web/API/File
        const isAudio = isAudioFile(file.type, file.name);
        const isVideo = isVideoFile(file.type, file.name);

        if (isAudio || isVideo) {
            const mediaType = isVideo ? 'video' : 'audio';
            const url = URL.createObjectURL(file);
            const playlistItem = {
                name: file.name,
                file: file,
                url: url,
                duration: 0,
                mediaType: mediaType
            };

            // Get duration
            const media = isVideo ? document.createElement('video') : new Audio();
            media.src = url;
            media.addEventListener('loadedmetadata', async () => {
                playlistItem.duration = media.duration;
                updatePlaylistDisplay();
                // Save file to IndexedDB after duration is loaded
                try {
                    const dbId = await saveFileToDB(file, file.name, media.duration, null, mediaType);
                    playlistItem.id = dbId;
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
        currentPlayer.currentTime = currentTime;
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

        const mediaIcon = item.mediaType === 'video' ? '🎬' : '🎵';

        playlistItem.innerHTML = `
            <span class="playlist-item-number">${index + 1}</span>
            <span class="playlist-item-name">${mediaIcon} ${item.name}</span>
            <span class="playlist-item-duration">${formatTime(item.duration)}</span>
            <button class="delete-btn" title="Delete">🗑️</button>
        `;
        
        playlistItem.addEventListener('click', (e) => {
            // Don't trigger track selection if delete button is clicked
            if (e.target.classList.contains('delete-btn') || e.target.closest('.delete-btn')) {
                e.stopPropagation();
                deletePlaylistItem(index);
                return;
            }
            currentTrackIndex = index;
            loadTrack(index);
            playTrack();
        });
        
        playlist.appendChild(playlistItem);
    });
}

// Delete playlist item
// Based on MDN: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/delete
async function deletePlaylistItem(index) {
    if (index < 0 || index >= playlistItems.length) return;
    
    const item = playlistItems[index];
    const wasCurrentTrack = index === currentTrackIndex;
    const wasPlaying = isPlaying;
    
    // Delete from IndexedDB if it has an ID
    if (item.id) {
        try {
            await deleteFileFromDB(item.id);
        } catch (error) {
            console.error('Error deleting file from database:', error);
        }
    }
    
    // Revoke the object URL to free memory (only for local files, not stream URLs)
    // Based on MDN: https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL
    if (item.url && item.file) {
        URL.revokeObjectURL(item.url);
    }
    
    // Remove from array
    playlistItems.splice(index, 1);
    
    // Adjust current track index if needed
    if (wasCurrentTrack) {
        if (playlistItems.length === 0) {
            currentTrackIndex = -1;
            audioPlayer.src = '';
            videoPlayer.src = '';
            videoContainer.style.display = 'none';
            trackTitle.textContent = 'No track selected';
            trackTime.textContent = '00:00 / 00:00';
            progressBar.value = 0;
            pauseTrack();
        } else {
            // If we deleted the last item, move to the new last item
            if (index >= playlistItems.length) {
                currentTrackIndex = playlistItems.length - 1;
            } else {
                // Otherwise, the next item takes the current index
                currentTrackIndex = index;
            }
            loadTrack(currentTrackIndex);
            if (wasPlaying && playlistItems.length > 0) {
                playTrack();
            }
        }
    } else if (index < currentTrackIndex) {
        // If we deleted an item before the current track, adjust the index
        currentTrackIndex--;
    }
    
    updatePlaylistDisplay();
    savePlayerState();
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds === 0 || !isFinite(seconds)) return '0:00:00';

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Track loading and playback
function loadTrack(index) {
    if (index < 0 || index >= playlistItems.length) return;

    currentTrackIndex = index;
    const track = playlistItems[index];

    // Pause and reset both players
    audioPlayer.pause();
    videoPlayer.pause();

    // Determine which player to use
    if (track.mediaType === 'video') {
        // Switch to video player
        currentPlayer = videoPlayer;
        videoPlayer.src = track.url;
        videoPlayer.volume = audioPlayer.volume; // Sync volume
        videoContainer.style.display = 'flex';
        videoPlayer.load();
    } else {
        // Switch to audio player
        currentPlayer = audioPlayer;
        audioPlayer.src = track.url;
        videoContainer.style.display = 'none';
        audioPlayer.load();
    }

    trackTitle.textContent = track.name;
    updatePlaylistDisplay();
    savePlayerState();
}

function playTrack() {
    if (currentTrackIndex === -1 || playlistItems.length === 0) return;

    currentPlayer.play()
        .then(() => {
            isPlaying = true;
            playPauseIcon.textContent = '⏸';
            fullscreenPlayPauseIcon.textContent = '⏸';
        })
        .catch(error => {
            console.error('Error playing media:', error);
        });
}

function pauseTrack() {
    currentPlayer.pause();
    isPlaying = false;
    playPauseIcon.textContent = '▶';
    fullscreenPlayPauseIcon.textContent = '▶';
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

// Helper function to update time display
function updateTimeDisplay() {
    if (currentPlayer.duration) {
        // Check if duration is finite (not Infinity for streams)
        if (isFinite(currentPlayer.duration)) {
            const progress = (currentPlayer.currentTime / currentPlayer.duration) * 100;
            progressBar.value = progress;
            trackTime.textContent = `${formatTime(currentPlayer.currentTime)} / ${formatTime(currentPlayer.duration)}`;
        } else {
            // For streams with unknown duration, just show elapsed time
            progressBar.value = 0;
            trackTime.textContent = formatTime(currentPlayer.currentTime);
        }
    }
    // Save state periodically
    const now = Date.now();
    if (now - lastSaveTime >= SAVE_INTERVAL) {
        savePlayerState();
        lastSaveTime = now;
    }
}

// Attach timeupdate to both players
audioPlayer.addEventListener('timeupdate', updateTimeDisplay);
videoPlayer.addEventListener('timeupdate', updateTimeDisplay);

progressBar.addEventListener('input', () => {
    if (currentPlayer.duration) {
        const seekTime = (progressBar.value / 100) * currentPlayer.duration;
        currentPlayer.currentTime = seekTime;
    }
});

// Volume control - sync both players
volumeSlider.addEventListener('input', () => {
    const volume = volumeSlider.value / 100;
    audioPlayer.volume = volume;
    videoPlayer.volume = volume;
    volumeValue.textContent = `${volumeSlider.value}%`;
    // Sync with fullscreen volume slider
    fullscreenVolumeSlider.value = volumeSlider.value;
    fullscreenVolumeValue.textContent = `${volumeSlider.value}%`;
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

// Media player events
function handleMediaEnded() {
    if (repeatMode === 'one') {
        currentPlayer.currentTime = 0;
        playTrack();
    } else if (repeatMode === 'all') {
        handleNextTrack();
    } else {
        handleNextTrack();
    }
}

function handleMediaLoaded() {
    progressBar.value = 0;
    if (isFinite(currentPlayer.duration)) {
        trackTime.textContent = `0:00:00 / ${formatTime(currentPlayer.duration)}`;
    } else {
        // For streams with unknown duration, just show starting time
        trackTime.textContent = '0:00:00';
    }
}

// Attach events to both players
audioPlayer.addEventListener('ended', handleMediaEnded);
videoPlayer.addEventListener('ended', handleMediaEnded);
audioPlayer.addEventListener('loadedmetadata', handleMediaLoaded);
videoPlayer.addEventListener('loadedmetadata', handleMediaLoaded);

// Fullscreen functionality
// Based on MDN Fullscreen API: https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API
fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement &&
        !document.webkitFullscreenElement &&
        !document.mozFullScreenElement) {
        // Enter fullscreen
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (videoContainer.mozRequestFullScreen) {
            videoContainer.mozRequestFullScreen();
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        }
    }
});

// Update fullscreen button icon when fullscreen state changes
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('mozfullscreenchange', updateFullscreenButton);

function updateFullscreenButton() {
    const isFullscreen = document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement;
    fullscreenBtn.querySelector('span').textContent = isFullscreen ? '⛶' : '⛶';
    fullscreenBtn.title = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';

    // Show fullscreen controls when entering fullscreen
    if (isFullscreen) {
        showFullscreenControls();
        startFullscreenControlsTimer();
    }
}

// Fullscreen controls management
let fullscreenControlsTimer = null;
const FULLSCREEN_CONTROLS_TIMEOUT = 3000; // Hide after 3 seconds of inactivity

function showFullscreenControls() {
    fullscreenControls.classList.add('show');
    videoContainer.style.cursor = 'default';
}

function hideFullscreenControls() {
    const isFullscreen = document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement;
    if (isFullscreen && isPlaying) {
        fullscreenControls.classList.remove('show');
        videoContainer.style.cursor = 'none';
    }
}

function startFullscreenControlsTimer() {
    clearTimeout(fullscreenControlsTimer);
    fullscreenControlsTimer = setTimeout(hideFullscreenControls, FULLSCREEN_CONTROLS_TIMEOUT);
}

function resetFullscreenControlsTimer() {
    showFullscreenControls();
    startFullscreenControlsTimer();
}

// Show controls on mouse movement in fullscreen
videoContainer.addEventListener('mousemove', () => {
    const isFullscreen = document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement;
    if (isFullscreen) {
        resetFullscreenControlsTimer();
    }
});

// Also show controls when mouse enters the controls area
fullscreenControls.addEventListener('mouseenter', () => {
    clearTimeout(fullscreenControlsTimer);
    showFullscreenControls();
});

fullscreenControls.addEventListener('mouseleave', () => {
    const isFullscreen = document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement;
    if (isFullscreen) {
        startFullscreenControlsTimer();
    }
});

// Fullscreen play/pause button
fullscreenPlayPauseBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering other click events
    if (isPlaying) {
        pauseTrack();
    } else {
        playTrack();
    }
    resetFullscreenControlsTimer();
});

// Fullscreen previous button
fullscreenPrevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
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
    resetFullscreenControlsTimer();
});

// Fullscreen next button
fullscreenNextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (playlistItems.length === 0) return;

    if (isShuffleMode) {
        playRandomTrack();
    } else {
        handleNextTrack();
    }
    resetFullscreenControlsTimer();
});

// Fullscreen volume control
fullscreenVolumeSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    const volume = fullscreenVolumeSlider.value / 100;
    audioPlayer.volume = volume;
    videoPlayer.volume = volume;
    fullscreenVolumeValue.textContent = `${fullscreenVolumeSlider.value}%`;
    // Sync with main volume slider
    volumeSlider.value = fullscreenVolumeSlider.value;
    volumeValue.textContent = `${fullscreenVolumeSlider.value}%`;
    savePlayerState();
    resetFullscreenControlsTimer();
});

// Fullscreen progress bar
fullscreenProgressBar.addEventListener('input', () => {
    if (videoPlayer.duration) {
        const seekTime = (fullscreenProgressBar.value / 100) * videoPlayer.duration;
        videoPlayer.currentTime = seekTime;
        resetFullscreenControlsTimer();
    }
});

// Update fullscreen progress bar and time during video playback
videoPlayer.addEventListener('timeupdate', () => {
    if (videoPlayer.duration) {
        // Check if duration is finite (not Infinity for streams)
        if (isFinite(videoPlayer.duration)) {
            const progress = (videoPlayer.currentTime / videoPlayer.duration) * 100;
            fullscreenProgressBar.value = progress;
            fullscreenTrackTime.textContent = `${formatTime(videoPlayer.currentTime)} / ${formatTime(videoPlayer.duration)}`;
        } else {
            // For streams with unknown duration, just show elapsed time
            fullscreenProgressBar.value = 0;
            fullscreenTrackTime.textContent = formatTime(videoPlayer.currentTime);
        }
    }
});

// Click on video to toggle play/pause in fullscreen
videoPlayer.addEventListener('click', () => {
    const isFullscreen = document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement;
    if (isFullscreen) {
        if (isPlaying) {
            pauseTrack();
        } else {
            playTrack();
        }
        resetFullscreenControlsTimer();
    }
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
        case 'KeyF':
            // Toggle fullscreen with 'F' key when video is playing
            if (videoContainer.style.display !== 'none') {
                event.preventDefault();
                fullscreenBtn.click();
            }
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

