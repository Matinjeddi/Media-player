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

// File input handling
fileInput.addEventListener('change', handleFileSelection);

function handleFileSelection(event) {
    const files = Array.from(event.target.files);
    
    // Store the current playing state and time before adding files
    const wasPlaying = isPlaying;
    const currentTime = audioPlayer.currentTime;
    const wasLoaded = currentTrackIndex !== -1;
    
    files.forEach(file => {
        if (file.type.startsWith('audio/')) {
            const url = URL.createObjectURL(file);
            const playlistItem = {
                name: file.name,
                file: file,
                url: url,
                duration: 0
            };
            
            // Get duration
            const audio = new Audio(url);
            audio.addEventListener('loadedmetadata', () => {
                playlistItem.duration = audio.duration;
                updatePlaylistDisplay();
            });
            
            playlistItems.push(playlistItem);
        }
    });
    
    updatePlaylistDisplay();
    
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
    
    // Clear the file input value to prevent issues on mobile
    // This allows the same file to be selected again if needed
    event.target.value = '';
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

// Progress bar
audioPlayer.addEventListener('timeupdate', () => {
    if (audioPlayer.duration) {
        const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBar.value = progress;
        trackTime.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
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

