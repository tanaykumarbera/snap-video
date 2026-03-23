# Agents Documentation 🤖

This file serves as the context and instruction set for an AI Coding Assistant working on the `SnapVideo` project.

## Project Structure & Architecture

SnapVideo is a no-build, client-side application. The goal is to keep it dependencies-free (no complex bundlers like Webpack/Vite unless absolutely necessary) and purely relying on standard browser APIs.

- `index.html`: The core application container for the video player.
- `app.js`: Contains all the logic (File System Access APIs, DOM manipulation, state management, indexedDB caching).
- `styles.css`: Vanilla CSS managing the dark-mode aesthetic. 
- `service-worker.js` / `manifest.json`: Provide PWA and offline capability.
- `landing.html` / `terms.html`: Static pages distributed alongside the app.

## File System Persistence

SnapVideo relies heavily on the **File System Access API** (`window.showDirectoryPicker`, `window.showOpenFilePicker`) to persist user settings and snaps.
- Snaps are saved onto the local storage per video (using localStorage conditionally).
- Snaps can be *permanently* backed up to a local directory using the `.snapinfo` pattern (e.g. `.videoName.mp4.snapinfo`).
- IndexedDB (`SnapVideoDB`) briefly caches the `dirHandle` so the user doesn't have to re-select the folder every time they launch.

## Maintenance Guidelines

1. **Aesthetics**: Ensure any new UI/UX adheres to the dark-themed `#7c5cfc` accent premium design. 
2. **Offline-First**: Never introduce server-side logic or third-party tracking that limits offline capability.
3. **Vanilla JS**: Refrain from moving into React or Vue unless the complexity reaches an unscalable breaking point. Keep `app.js` concise and compartmentalized.
