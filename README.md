# around

Around is a mobile and desktop spatial audio experiment by Kwame Boateng. It renders mono audio in three-dimensional space using HRTF-based binaural processing, then lets the listener move the sound around them with either a phone gyroscope, touch, or mouse drag.

Headphones are recommended.

## Experience

- `/` - landing page with device-aware entry
- `/desktop` - mouse-drag spatial control with a Three.js visualizer and full music player
- `/mobile` - gyroscope or touch-drag spatial control, optimized for phones

The app includes demo MP3 tracks, local file upload, and a URL loader for CORS-enabled audio files.

## How It Works

Around is a web port of a C++ spatial audio engine. The browser version keeps the same core ideas:

- MIT KEMAR HRTF impulse responses for binaural positioning
- bilinear interpolation across azimuth and elevation
- FFT overlap-add convolution in an `AudioWorklet`
- distance attenuation and air absorption
- Schroeder-style reverb for externalization
- crossfaded HRTF updates to avoid crackles during fast movement

The visual layer is built with Three.js: a soft sphere represents the listening field, and the source dot shows where the sound is positioned.

## Tech Stack

- SvelteKit
- Three.js
- Web Audio API
- AudioWorklet
- DeviceOrientation API

## Project Structure

```text
src/lib/audio/
  engine.js              # main Web Audio wrapper and player API
  hrtf-loader.js         # MIT KEMAR loading + interpolation
  spatial-processor.js   # AudioWorklet source copy

src/lib/three/
  scene.js               # Three.js renderer/camera setup
  sphere-vis.js          # spatial sphere visualization

src/routes/
  +page.svelte           # landing page
  desktop/+page.svelte   # desktop experience
  mobile/+page.svelte    # mobile experience

static/
  audio/                 # bundled demo tracks
  hrtf/                  # MIT KEMAR HRTF dataset
  spatial-processor.js   # served AudioWorklet module
```

`static/spatial-processor.js` is the version the browser loads at runtime. If you edit `src/lib/audio/spatial-processor.js`, copy the change into `static/spatial-processor.js` before testing or deploying.

## Development

Install dependencies:

```sh
npm install
```

Start the dev server:

```sh
npm run dev
```

Expose it on your local network:

```sh
npm run dev -- --host
```

Build for production:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Mobile Testing

AudioWorklet and gyroscope permission require a secure context. `localhost` works on desktop, but a phone visiting `http://192.168.x.x:5173` does not count as secure.

For mobile testing before deployment, use an HTTPS tunnel:

```sh
npm install -g ngrok
ngrok http 5173
```

Open the generated `https://` URL on your phone.

## Assets

HRTF files live in `static/hrtf/` using the MIT KEMAR compact dataset folder structure:

```text
static/hrtf/elev-40/H-40e000a.wav
static/hrtf/elev0/H0e000a.wav
static/hrtf/elev40/H40e000a.wav
```

Demo audio files live in `static/audio/`.

## Credits

Built from the original C++ spatial audio engine:  
https://github.com/k-boateng/spatial-audio
