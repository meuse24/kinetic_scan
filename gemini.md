# MEUSE24 Kinetic-Scan - Technical Documentation

**MEUSE24 Kinetic-Scan** is a fast-paced retro arcade shooter. The player pilots a spaceship through a dangerous asteroid field, dodging hazards and destroying procedurally generated asteroids that shatter into smaller fragments on impact. The game blends classic gameplay with a modern vector aesthetic and a dynamic scoring system.

## Tech Stack
- **Engine:** Phaser 3
- **Language:** TypeScript
- **Build Tool:** Vite
- **Architecture:** Modular Scene-based management

## Features

### 1. Rendering & Visual Style
- **Vector Wireframe Style:** All game objects (Player, Bullets, Asteroids) are rendered programmatically using Phaser Graphics.
- **Dynamic Thruster:** The player ship features a flickering, procedurally generated thruster flame.
- **Particle System:** Juicy explosions using Phaser's Particle Emitter, featuring color gradients and fading effects.
- **Parallax Starfield:** A multi-layered background with moving stars.
- **Subtle Color System:** Procedural HSL-based asteroid palette (low saturation, mid-lightness) for slate blues, anthracite, sand greys, and oxidized reds with transparent fills.
- **Title Styling:** The MEUSE24 Kinetic-Scan logo uses the Chakra Petch (700) font with a three-line hollow vector layout (transparent fill, white stroke, soft glow) and a subtle floating motion.

### 2. Gameplay Mechanics
- **Adaptive Virtual Resolution:** 
    - **Desktop (Keyboard/Mouse):** 1000x1000 pixels (1:1 aspect ratio).
    - **Mobile (Touch):** 1000x1333 pixels (3:4 aspect ratio) to provide space for a dedicated touchpad.
- **Fixed Scaling:** All resolutions use "FIT" scaling for a consistent experience.
- **Procedural Asteroids:** Rocks are generated as irregular polygons with 8-12 points.
- **Splitting Logic:** Large asteroids (scale > 0.6) split into 2-3 smaller fragments upon destruction.
- **Dynamic Scoring:** Smaller asteroids are worth more points than larger ones.
- **Controls:** Multi-input support for Mouse, Touch, and Keyboard.
- **Relative Touch Control:** On mobile, the ship follows the finger's delta movement (offset-based).
- **Dedicated Control Area:** On mobile devices, a visual 1000x333 touchpad area is provided below the playfield, enclosed in a subtle cyan frame.
- **Portrait Orientation:** Mobile devices show a rotate warning in landscape.
- **Lower Third Constraint:** The player is restricted to the bottom 33% of the 1000x1000 playfield.

### 3. Combat Mechanics
- **Platform-Specific Control:** Desktop uses manual fire via Space/left-click with a short tap buffer; mobile uses "Touch-to-Fire" (auto-fires only when the screen is touched).
- **Tactical Mine Deploy:** Each run starts with 2 mine charges. Additional **MINE_LAYER** pickups and the **MINE STOCK** perk add more charges. Deploy a 5-mine field via `M` (keyboard) or double-click/double-tap.
- **Heat & Overheat:** Each shot raises heat (0–100). At 100, the ship overheats and cannot fire for 2 seconds. Heat cools down gradually when not firing.
- **Mobile Balancing:** On mobile devices, the heat decay rate is increased by ~60% to compensate for the continuous firing while moving, allowing for tactical cooling during short movement pauses.
- **Contextual UI:** The heat bar follows the ship and sits just below it for quick peripheral readability, blinking red on overheat.
- **FX & Audio:** Manual shots use a heavier laser timbre and larger muzzle flash. Overheat triggers a brief smoke puff on high-end desktops.

### 4. Systems
- **Scene Management:**
    - `MainScene`: Core gameplay loop and HUD.
    - `GameOverScene`: Score summary and restart logic.
- **Highscore System:** Persisted via `localStorage`.
- **Object Pooling:** Efficient Phaser Group pooling for bullets, enemies, power-ups, drones, and proximity mines.

### 5. Typography
- **Font:** Google Font 'Press Start 2P' for a classic 8-bit arcade aesthetic.

### 6. VFX & Juice
- **Player Death Explosion:** A massive burst of 200 particles with long lifespan (up to 2s) and high velocity to dramatize the "Game Over" moment.
- **Enhanced Camera Shake:** Dynamic camera feedback during collisions, with a particularly intense shake (duration: 500ms, intensity: 0.04) upon player destruction.
- **Delayed Scene Transition:** The game waits for the death explosion to unfold before transitioning to the Game Over screen.

### 7. Audio System
- **Synthetic Sound Generation:** All game sounds are generated programmatically using the Web Audio API, eliminating the need for external assets.
- **Classic Arcade Effects:**
    - **Laser (Shoot):** A frequency-ramped square wave for the "Pew-Pew" effect.
    - **Explosion:** Low-pass filtered white noise with exponential gain decay.
    - **Player Death:** A combination of deep crunching noise and a falling square wave for dramatic effect.
- **Autoplay Compliance:** Audio context is resumed upon the first user interaction (coin insert or start selection).

### 8. Bonus System & Homing Missiles
- **Bonus Ship (UFO):** A rare UFO (every 30-60s) moves across the screen on a sinusoidal path and emits a distinct spherical sound.
- **Power-up: Magnetic Bullets:** Shooting the UFO activates magnetic homing for 5 seconds.
- **Homing Logic:** While active, projectiles seek the nearest asteroid and steer toward it smoothly.
- **Visual & Audio Feedback:** Magnetic Bullets glow cyan. A pulsing HUD timer visualizes remaining duration.

### 9. Universal Pause System
- **Cross-Platform Controls:**
    - **Desktop:** Pause via 'P' or 'Esc'.
    - **Mobile/Tablet:** Large, touch-optimized pause button ('|| PAUSE') in the HUD.
- **Auto-Pause:** The game pauses automatically when the browser tab loses focus (blur event), ideal for phone users during interruptions.
- **Pause Mode:** A semi-transparent overlay stops gameplay and suspends synthetic audio (AudioContext suspend).
- **Interactive UI:** The pause screen includes 'RESUME' and 'SOUND ON/OFF' buttons for quick adjustments without a keyboard.

### 10. Power-up System & Smart Trigger Logic
The game features a highly dynamic power-up system that reacts to both player skill and in-game situations.

- **Basis Power-ups:**
    - **TRIPLE_SHOT (10s):** Fächer-Muster Schüsse.
    - **SLOW_MOTION (7s):** 50% Welt-Verlangsamung.
    - **SHIELD:** Absorbiert einen Treffer.
- **Advanced Mechanics:**
    - **EMP_WAVE:** Eine expandierende Schockwelle, die alle Asteroiden im Umkreis vaporisiert.
    - **GHOST_PHASE:** Der Spieler wird physisch immateriell (keine Kollisionen) und flackert transparent.
    - **WINGMAN_DRONES:** Zwei Drohnen begleiten den Spieler und verdoppeln die Feuerkraft.
    - **BLACK_HOLE:** Ein lokales Gravitationsfeld zieht Asteroiden in sein Zentrum.
    - **SHIELD_BUNKER:** Zeitlich begrenzte, unzerstoerbare Bunker als taktische Deckung.
    - **MINE_LAYER:** Gibt Minenladungen; jede Ausloesung setzt 5 pulsierende Naeherungsminen gegen Asteroiden/UFOs/Invader.
- **Smart Triggers (Stats Module):**
    - **Combo Spawn:** Based on kill rate. Increment combo by 1 per kill if time since the previous kill is `< 3000ms`.
    - **Near-Miss Trigger:** If the player survives 3 close encounters with asteroids, an **EMP_WAVE** is spawned as a rescue.
    - **Accuracy Reward:** At > 80% accuracy, **WINGMAN_DRONES** appear.
    - **Pity Spawn:** Guarantees a power-up after 60 seconds of inactivity.
- **Hardware VFX:** EMP and Black Hole use glow effects on high-end desktop systems (e.g., P2000-class GPUs), while on mobile they are rendered as performant line vectors. Selection is a heuristic based on renderer and desktop flags, not explicit GPU detection.

### 11. Arcade Simulation & Shaders
The game is transformed into an authentic arcade experience.

- **Attract Mode:** A new entry scene simulates waiting for a coin insert ('INSERT COIN'). The text is interactive and adds credits on touch. The UI cycles every 5 seconds between four message blocks:
    - **Infoblock:** INSERT COIN prompt and basic credits info.
    - **Top Scores:** Local leaderboard summary.
    - **Daily Challenge:** Dedicated entry point for the seeded daily run.
    - **Live Stats:** Server-backed runtime stats (`TOTAL USERS`, `COINS USED`) with safe local fallback when API is unavailable.
- **CRT Post-Processing Shader:**
    - **Scanlines:** Recreates the look of an old CRT.
    - **Curvature:** Distorts the image edges for the 3D feel of a curved monitor.
    - **Chromatic Aberration:** Simulates RGB edge fringing.
    - **Coverage:** Applied to gameplay, attract, pause, and game over screens (not the physical bezel).
    - **Hardware Fallback:** Full effect on high-end desktop systems (e.g., P2000-class GPUs); on mobile, curvature is disabled to reduce GPU load. Selection is heuristic-based.
- **Highscore Name Entry:** New high scores allow players to enter 3-letter initials.
    - **Arcade Controls:** Arrows (change letter) + Fire/Space/Enter (confirm).
    - **Touch/Gesture:** Swipe Up/Down or tap above/below the letter to cycle; tap the letter itself to confirm.
- **GameOver Leaderboard Loop:** The Game Over screen renders the Top-5 list from `localStorage`, highlights newly qualified scores, and routes players through a coin-continue flow (first input inserts credit + coin sound, second input restarts). All on-screen commands (INSERT COIN, 1P/2P START) are touch-interactive. After 15 seconds of inactivity, the game returns to the Attract screen.

### 12. Performance & VFX Fallbacks
To ensure optimal play on all devices (from high-end desktops like P2000-class machines to smartphones), the game uses a pragmatic hardware fallback heuristic.

- **Slow-Motion Effect:**
    - **Desktop (WebGL):** Use a `ColorMatrix` shader (`PostFX`) that shifts the palette into a cool, desaturated blue ("Night Mode") for a sci-fi atmosphere.
    - **Mobile:** Use a simple, semi-transparent blue rectangle overlay to achieve a similar look with minimal cost (no shader pass), preserving battery and framerate.
- **Detection:** The decision is made at runtime based on `game.device.os.desktop` and the active renderer.

### 13. Physical Bezel & Real-time Reflections
A dedicated overlay scene adds a physical CRT frame around the game, without affecting the CRT shader on the gameplay layer.

- **Scene Layering:** `BezelScene` starts before `MainScene` and renders above it, ensuring the bezel stays sharp while the CRT shader only affects the gameplay scene.
- **Procedural Bezel:** The frame is drawn with `Phaser.GameObjects.Graphics`, filling the viewport and erasing the 1000x1000 playfield window. Screws and subtle plastic noise are added for authenticity.
- **Real-time Reflections (High-End):** A `RenderTexture` captures `MainScene` each frame, applies a strong blur and dimming, and is masked to the inner rim to simulate screen glow on the plastic.
- **Responsive Fit:** The bezel scales to the browser viewport, while the hole aligns precisely to the FIT-scaled 1000x1000 play area.

### 14. Attract Mode & Demo-Loop
The attract screen is a playable-looking demo loop to add life and showcase features.

- **Arcade Flow:** The attract screen runs continuously with animated UI, demo asteroids, and quick preview elements to drive player curiosity.
- **Background Asteroids:** `EnemyManager` runs in `AttractScene`, continuously spawning asteroids that drift behind the UI. Periodic scripted splits call `splitAsteroid` to demonstrate fragmenting behavior without player input.
- **Recycling:** Asteroids are pooled via the group; off-screen sprites call `disableBody(true, true)` and are reused for subsequent spawns.
- **Ambient Depth:** A subtle dust particle stream provides constant parallax-like motion.
- **UI Showcase:** Heartbeat-style pulsing text alternates with a fading Top-5 high-score table, plus a row of power-up icons labeled "COLLECT THESE!" to preview gameplay rewards.

### 15. Help System
A dedicated Help screen provides compact, scrollable guidance without breaking the CRT presentation.

- **Access:** Press `H` or tap the 'H' icon/text from the Attract screen, in-game HUD, or the Game Over screen.
- **Exit:** Press `H` again or tap the 'BACK' button to return to the previous screen.
- **Content:** Controls, power-ups, heat management, and scoring are summarized in a scrollable, masked panel (touch-draggable).

### 16. Credits & Turn-Based Multiplayer
Classic arcade credits and a two-player alternating flow keep the game loop authentic and competitive.

- **Credit Manager:** Global credits persist across scenes. Press `I` or tap the on-screen "INSERT COIN (I)" text to add credits. Start buttons consume 1 credit for 1P or 2 credits for 2P.
- **2-Player Turn System:** Each player has their own score, lives, and active power-ups. When a life is lost, gameplay pauses briefly, a "PLAYER X GET READY" overlay appears with an interactive "PRESS START" prompt, and control swaps after input.
- **End Condition:** The run ends only when both players are out of lives. Game Over shows both final scores and allows immediate 1P/2P restart with credits.

### 17. Score Milestones & Combo System
- **Combo System:** Kill-streak tracking with configurable timeout (3s default). Each consecutive kill within the window increments the combo counter and multiplier. Score popups display combo multiplier and bonus points.
- **Score Milestones:** At 5K, 10K, 25K, 50K, and 100K score thresholds, the game triggers camera flash + shake, an ascending arpeggio sound effect, and a large animated text label (e.g., "EXCELLENT!", "UNSTOPPABLE!").

### 18. Asteroid Swarms
- **V-Formation Spawning:** From level 2+, groups of 5-8 small asteroids spawn in V-formation every 20-30 seconds.
- **Swarm Kill Tracking:** Each swarm member carries a shared `swarmId`. Destroying all members of a swarm awards a bonus multiplier (3x per-asteroid bonus for full wipe).

### 19. Rogue-Lite Perk System
- **Post-Boss Selection:** After each boss defeat, a `PerkSelectScene` overlay presents 3 random perk cards.
- **13 Perks:** Fire rate, max life, fragment score, homing chance, cooldown speed, bullet speed, score multiplier, shield-on-level, explosion radius, combo window, magnet range, start shield, mine stock.
- **Responsive Layout:** On narrow screens (mobile), cards are automatically stacked vertically with an internal horizontal layout (Icon | Title + Description) to ensure visibility without scrolling.
- **Stacking:** Most perks can be stacked up to 3 times for cumulative effects.
- **15s Auto-Timeout:** If no selection is made, a random perk is chosen automatically.
- **Keyboard/Mouse:** Select via keys `1`/`2`/`3` or click.

### 20. Boss Modifiers
- **From Level 3+:** Boss UFOs receive a random modifier for variety.
- **4 Modifier Types:**
  - `Shielded`: passive HP regeneration (0.2 HP/s).
  - `Summoner`: periodically spawns mini asteroid swarms near the boss.
  - `Berserk`: movement speed scales up as HP decreases (up to 60% faster at low HP).
  - `Armored`: 50% damage reduction on all hits.

### 21. Daily Challenge
- **Seeded Runs:** Today's date string seeds `Phaser.Math.RND` for deterministic spawn sequences.
- **Fixed Difficulty:** Always `normal`, 1P only.
- **Separate Leaderboard:** Daily high scores stored independently (`spaceShooterDailyHighscore`).
- **HUD Badge:** "DAILY CHALLENGE" displayed during gameplay.
- **UI Integration:** Accessible via the "DAILY CHALLENGE" block in the Attract screen rotation or the `C` key.

### 22. Persistent Stats & Unlocks
- **Lifetime Stats:** Total kills, total score, total games, total deaths, highest combo, highest level, boss kills, playtime — all persisted to `localStorage`.
- **Ship Skins:** 5 color variants unlocked via milestone conditions (500 kills, level 5, 10 boss kills, 50K total score).

### 23. Tutorial Hints
- **First-Play Only:** On the very first game start, 3 sequential fade-in/fade-out hints guide the player: "ARROWS TO MOVE", "SPACE TO FIRE", "COLLECT POWER-UPS".
- **One-Time:** Stored in `localStorage` (`spaceShooterTutorialShown`), never shown again.

### 24. Volume Control
- **Per-Channel Sliders:** Pause menu features 3 draggable sliders for MASTER, SFX, and BGM volume.
- **Effective Volume:** SFX = master × sfx, BGM = master × bgm.
- **Persistence:** Volume settings saved to `localStorage` and restored on next session.

### 25. Remote Stats API (Optional)
- **Endpoint:** `public/api/stats.php` (deployed as `dist/api/stats.php`).
- **Persistence:** Runtime writes to `public/api/data/stats.runtime.json` (seed file remains `stats.json`).
- **Actions:** `register_user`, `consume_coins`, `submit_highscore`.
- **User Counters:**
  - `users`: rolling recently-seen user map (server-pruned to last 30),
  - `totalUsersEver`: cumulative all-time unique users (independent counter).
- **Client Integration (`RemoteStatsService`):**
  - lazy snapshot fetching with cache/inflight dedupe,
  - immediate highscore submit on new entry,
  - event queue in localStorage with automatic retry on reconnect,
  - gameplay never blocks if API/network is unavailable.

### 26. Browser Translation Handling
- The game UI remains English-first (`lang="en"`).
- To reduce Edge/Chromium translation popups:
  - `translate="no"` on `<html>` and `<body>`,
  - `meta name="google" content="notranslate"`,
  - `Content-Language: en,de` metadata for mixed deployment context.
- PWA manifest declares `"lang": "en"`.
