# Audio Media Player

A web-based audio media player application that allows you to upload, manage, and play audio files directly in your browser. The player features persistent storage, playlist management, and full playback controls.

## Features

### File Management
- **Upload Multiple Audio Files**: Browse and select multiple audio files at once
- **Supported Formats**: MP3, WAV, OGG, AAC, M4A, FLAC, WebM, Opus, and other audio formats
- **Persistent Storage**: All uploaded files are automatically saved to IndexedDB and restored when you reload the page
- **Delete Files**: Remove individual tracks from the playlist with a delete button

### Playback Controls
- **Play/Pause**: Start and stop audio playback
- **Previous/Next Track**: Navigate through your playlist
- **Shuffle Mode**: Randomize track playback order
- **Repeat Mode**: Three modes available:
  - Off: Play through playlist and stop at the end
  - Repeat All: Loop through the entire playlist
  - Repeat One: Loop the current track indefinitely
- **Seek**: Click or drag the progress bar to jump to any position in the track
- **Volume Control**: Adjust volume from 0% to 100% with a slider

### Playlist Features
- **Visual Playlist**: See all your tracks with track numbers, names, and durations
- **Active Track Highlighting**: The currently playing track is highlighted in the playlist
- **Click to Play**: Click any track in the playlist to start playing it
- **Track Information**: View the current track name and elapsed/total time

### State Persistence
- **Automatic State Saving**: Your playback position, volume, shuffle/repeat settings, and current track are saved automatically
- **Session Restoration**: When you reload the page, the player restores:
  - Your entire playlist
  - The currently playing track
  - Your playback position
  - Volume level
  - Shuffle and repeat mode settings

### Keyboard Shortcuts
- **Spacebar**: Play/Pause
- **Left Arrow**: Previous track
- **Right Arrow**: Next track

### Technical Details
- **Client-Side Only**: All data is stored locally in your browser using IndexedDB and localStorage
- **No Server Required**: Works entirely offline after initial page load
- **Responsive Design**: Optimized for both desktop and mobile devices
- **Memory Management**: Properly manages object URLs to prevent memory leaks

## How to Use

1. **Add Files**: Click the "Browse Files" button to select one or more audio files from your device
2. **Play Music**: The first track will automatically start playing, or click any track in the playlist
3. **Control Playback**: Use the control buttons to play, pause, skip tracks, shuffle, or repeat
4. **Adjust Volume**: Use the volume slider to control playback volume
5. **Seek**: Click anywhere on the progress bar to jump to that position in the track
6. **Remove Tracks**: Click the delete button (🗑️) on any playlist item to remove it

## Browser Compatibility

This application uses modern web APIs:
- **IndexedDB API**: For persistent file storage
- **File API**: For reading uploaded files
- **HTML5 Audio API**: For audio playback
- **localStorage API**: For saving player state

Works in all modern browsers that support these APIs (Chrome, Firefox, Safari, Edge, etc.).

## Files

- `index.html`: The main HTML structure of the application
- `script.js`: All JavaScript functionality including file handling, playback controls, and storage management
- `styles.css`: Styling for the user interface

