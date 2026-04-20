<script>
    import { onMount } from 'svelte';

    // ─── API Configuration ────────────────────────────────────────────────────
    // Change this one constant to point to a different backend deployment.
    const BASE_URL = 'https://ru-occupied.vercel.app';
    // ─────────────────────────────────────────────────────────────────────────

    const CAMPUS_NAMES = {
        'busch':       'Busch Campus',
        'livingston':  'Livingston Campus',
        'college-ave': 'College Avenue Campus',
        'cook-doug':   'Cook/Douglass Campus'
    };

    const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const DAYS  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // ─── Page state ──────────────────────────────────────────────────────────
    // 'home' | 'buildings' | 'rooms' | 'calendar'
    let page = 'home';
    let navigationStack = [];

    // ─── Data state ──────────────────────────────────────────────────────────
    let campusData   = {};   // built from API response
    let loading      = true;
    let loadError    = false;

    let currentCampus   = null;   // campus id string
    let currentBuilding = null;   // building id string
    let currentRoom     = null;   // room name string

    let calendarView = 'daily';   // 'daily' | 'weekly'
    let occupancy    = {};        // mock occupancy grid for selected room

    // ─── Search ──────────────────────────────────────────────────────────────
    let searchQuery   = '';
    let searchFocused = false;

    $: searchResults = (() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return [];
        const results = [];
        for (const [campusId, campus] of Object.entries(campusData)) {
            for (const [buildingId, building] of Object.entries(campus.buildings)) {
                for (const [roomId, room] of Object.entries(building.rooms)) {
                    if (`${building.name} ${room.name}`.toLowerCase().includes(q)) {
                        results.push({ campusId, buildingId, roomId,
                            campusName: campus.name, buildingName: building.name, roomName: room.name });
                    }
                }
            }
        }
        return results;
    })();

    function navigateToRoom(campusId, buildingId, roomId) {
        currentCampus   = campusId;
        currentBuilding = buildingId;
        currentRoom     = roomId;
        occupancy       = campusData[currentCampus].buildings[currentBuilding].rooms[currentRoom].occupancyPredictions;
        navigationStack = ['home', 'buildings', 'rooms'];
        page = 'calendar';
        searchQuery   = '';
        searchFocused = false;
    }

    // ─── Status toast ────────────────────────────────────────────────────────
    let statusMessage = '';
    let statusVisible = false;
    let statusTimer   = null;

    function showStatus(msg) {
        statusMessage = msg;
        statusVisible = true;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { statusVisible = false; }, 2000);
    }

    // ─── Keyboard navigation ─────────────────────────────────────────────────
    function handleKeydown(e) {
        if (e.key === 'Escape' && navigationStack.length > 0) navigateBack();
    }

    // ─── Navigation helpers ──────────────────────────────────────────────────
    function navigateBack() {
        const prev = navigationStack.pop();
        if (prev) {
            page = prev;
            showStatus('Navigated back');
        }
        // Force reactivity on the stack
        navigationStack = navigationStack;
    }

    function goHome() {
        navigationStack = [];
        page = 'home';
    }

    function goToCampus(campusId) {
        currentCampus = campusId;
        navigationStack = [...navigationStack, page];
        page = 'buildings';
    }

    function goToBuilding(buildingId) {
        currentBuilding = buildingId;
        navigationStack = [...navigationStack, page];
        page = 'rooms';
    }

    function goToRoom(roomId) {
        currentRoom = roomId;
        // occupancy = generateMockOccupancy();
        occupancy = campusData[currentCampus].buildings[currentBuilding].rooms[currentRoom].occupancyPredictions;
        navigationStack = [...navigationStack, page];
        page = 'calendar';
    }

    // ─── Derived selections ──────────────────────────────────────────────────
    $: selectedCampus   = currentCampus   ? campusData[currentCampus]                              : null;
    $: selectedBuilding = selectedCampus  ? selectedCampus.buildings[currentBuilding]              : null;
    $: roomTitle        = selectedBuilding ? `${selectedBuilding.name} — Room ${currentRoom}`      : '';

    // ─── Room status badge helpers ────────────────────────────────────────────
    function roomStatus(occupied) {
        if (occupied) return { label: 'Occupied Now', cls: 'status-busy'  };
        return              { label: 'Free Now',     cls: 'status-free'  };
    }

    // ─── Calendar helpers ────────────────────────────────────────────────────
    
    // Formats 7x24 occupancy list into a map
    function formatOccupancy(occList) {
        const occ = {};
        let i = 0;
        DAYS.forEach(day => {
            occ[day] = {};
            HOURS.forEach(hour => { occ[day][hour] = occList[i]; i++; });
        });
        return occ;
    }
    function generateMockOccupancy() {
        const occ = {};
        DAYS.forEach(day => {
            occ[day] = {};
            HOURS.forEach(hour => { occ[day][hour] = Math.random(); });
        });
        return occ;
    }

    function probClass(prob) {
        return `prob-${Math.floor(prob * 4) * 25}`;
    }

    function formatHour(h) {
        // return h == 0 ? `12AM` : h <= 12 ? `${h}AM` : `${h - 12}PM`;
        return h < 12 ? `${h % 12 || 12}AM` : `${h % 12 || 12}PM`;
    }

    $: currentHour = new Date().getHours();
    $: currentDay  = DAYS[new Date().getDay()]; // getDay(): 0=Sun, 1=Mon, … 6=Sat

    // ─── API fetch on mount ──────────────────────────────────────────────────
    onMount(async () => {
        try {
            const res = await fetch(`${BASE_URL}/api/sensors`);
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const sensors = await res.json();

            const built = {};
            sensors.forEach(({ campus, building, room, currently_occupied, occupancy_predictions }) => {
                if (!campus || !building || !room || currently_occupied == null) return;

                // Ensure the campus entry exists
                if (!built[campus]) {
                    built[campus] = {
                        name: CAMPUS_NAMES[campus] || campus,
                        buildings: {}
                    };
                }

                // Ensure the building entry exists under this campus.
                // building is used as both the key and the display name;
                // if you later add a separate display name field to the schema,
                // replace the second `building` below with that field.
                if (!built[campus].buildings[building]) {
                    built[campus].buildings[building] = {
                        name: building,
                        rooms: {}
                    };
                }

                // Add the room to its building if not already present
                // const rooms = built[campus].buildings[building].rooms;
                // if (!rooms.includes(room)) rooms.push(room);
                if (!built[campus].buildings[building].rooms[room]) {
                    built[campus].buildings[building].rooms[room] = {
                        name: room,
                        currentlyOccupied: currently_occupied,
                        occupancyPredictions: !occupancy_predictions ? generateMockOccupancy() : formatOccupancy(occupancy_predictions)
                    };
                }
            });

            campusData = built;
        } catch (err) {
            console.error('Failed to load sensor data:', err);
            loadError = true;
        } finally {
            loading = false;
        }
    });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app">

    <!-- ── Home page ─────────────────────────────────────────────────────── -->
    {#if page === 'home'}
        <div class="container">
            <header>
                <h1>RU Occupied</h1>
                <p class="subtitle">Check room availability across Rutgers campuses</p>
            </header>

            {#if !loading && !loadError && Object.keys(campusData).length > 0}
                <div class="search-wrapper">
                    <input
                        class="search-input"
                        type="search"
                        placeholder="Search by room or building…"
                        bind:value={searchQuery}
                        on:focus={() => searchFocused = true}
                        on:blur={() => setTimeout(() => { searchFocused = false; }, 150)}
                        aria-label="Search rooms"
                        aria-expanded={searchFocused && searchResults.length > 0}
                        aria-haspopup="listbox"
                    />
                    {#if searchFocused && searchQuery.trim()}
                        <ul class="search-results" role="listbox">
                            {#if searchResults.length === 0}
                                <li class="search-no-results">No rooms found</li>
                            {:else}
                                {#each searchResults as result}
                                    <li
                                        class="search-result-item"
                                        role="option"
                                        aria-selected="false"
                                        on:mousedown={() => navigateToRoom(result.campusId, result.buildingId, result.roomId) }
                                    >
                                        <span class="result-room">{result.roomName}</span>
                                        <span class="result-meta">{result.buildingName} · {result.campusName}</span>
                                    </li>
                                {/each}
                            {/if}
                        </ul>
                    {/if}
                </div>
            {/if}

            {#if loading}
                <div class="center"><div class="loading-indicator"></div></div>

            {:else if loadError}
                <p class="error-msg">Failed to load campus data. Please try again later.</p>

            {:else if Object.keys(campusData).length === 0}
                <p class="empty-msg">No sensor data available.</p>

            {:else}
                <div class="cards">
                    {#each Object.entries(campusData) as [campusId, campus]}
                        {@const totalRooms = Object.values(campus.buildings).reduce((s, b) => s + Object.keys(b.rooms).length, 0)}
                        <div
                            class="card"
                            role="button"
                            tabindex="0"
                            aria-label="View {campus.name} buildings"
                            on:click={() => goToCampus(campusId)}
                            on:keypress={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToCampus(campusId); }}}
                        >
                            <div class="card-icon">🏫</div>
                            <h2>{campus.name}</h2>
                            <p>{totalRooms} monitored room{totalRooms !== 1 ? 's' : ''}</p>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

    <!-- ── Buildings page ────────────────────────────────────────────────── -->
    {:else if page === 'buildings' && selectedCampus}
        <div class="container">
            <div class="nav-buttons">
                <button class="back-btn" on:click={navigateBack}>← Back</button>
                <button class="home-btn" on:click={goHome}>⌂ Home</button>
            </div>
            <header><h1>{selectedCampus.name}</h1></header>
            <div class="cards">
                {#each Object.entries(selectedCampus.buildings) as [buildingId, building]}
                    <div
                        class="card"
                        role="button"
                        tabindex="0"
                        aria-label="View {building.name}, {Object.keys(building.rooms).length} rooms"
                        on:click={() => goToBuilding(buildingId)}
                        on:keypress={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToBuilding(buildingId); }}}
                    >
                        <div class="card-icon">🏢</div>
                        <h2>{building.name}</h2>
                        <p>{Object.keys(building.rooms).length} room{Object.keys(building.rooms).length !== 1 ? 's' : ''}</p>
                    </div>
                {/each}
            </div>
        </div>

    <!-- ── Rooms page ────────────────────────────────────────────────────── -->
    {:else if page === 'rooms' && selectedBuilding}
        <div class="container">
            <div class="nav-buttons">
                <button class="back-btn" on:click={navigateBack}>← Back</button>
                <button class="home-btn" on:click={goHome}>⌂ Home</button>
            </div>
            <header><h1>{selectedBuilding.name}</h1></header>
            <div class="cards">
                {#each Object.entries(selectedBuilding.rooms) as [roomId, room]}
                    {@const occupied = room.currentlyOccupied}
                    {@const status = roomStatus(occupied)}
                    <div
                        class="card"
                        role="button"
                        tabindex="0"
                        aria-label="View occupancy for Room {room.name}, status: {status.label}"
                        on:click={() => goToRoom(roomId)}
                        on:keypress={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToRoom(roomId); }}}
                    >
                        <div class="card-icon">🚪</div>
                        <h2>{room.name}</h2>
                        <p class="room-status {status.cls}">{status.label}</p>
                    </div>
                {/each}
            </div>
        </div>

    <!-- ── Calendar page ─────────────────────────────────────────────────── -->
    {:else if page === 'calendar' && currentRoom}
        <div class="container">
            <div class="nav-buttons">
                <button class="back-btn" on:click={navigateBack}>← Back</button>
                <button class="home-btn" on:click={goHome}>⌂ Home</button>
            </div>
            <header><h1>{roomTitle}</h1></header>

            <div class="occupancy-banner {campusData[currentCampus].buildings[currentBuilding].rooms[currentRoom].currentlyOccupied ? 'banner-busy' : 'banner-free'}">
            <span class="banner-dot"></span>
            <span class="banner-text">
                {campusData[currentCampus].buildings[currentBuilding].rooms[currentRoom].currentlyOccupied ? 'Currently occupied' : 'Currently free'}
            </span>
            <span class="banner-sub">Live sensor data</span>
        </div>

            <div class="calendar-controls">
                <select class="view-toggle" bind:value={calendarView}>
                    <option value="daily">Daily View</option>
                    <option value="weekly">Weekly View</option>
                </select>

                <div class="legend">
                    <div class="legend-item">
                        <div class="legend-box" style="background:#ffffff;"></div>
                        <span>0% likely</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-box" style="background:#90caf9;"></div>
                        <span>50% likely</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-box" style="background:#1565c0;"></div>
                        <span>100% likely</span>
                    </div>
                </div>
            </div>

            <div class="calendar">
                {#if calendarView === 'daily'}
                    <div class="calendar-grid daily">
                        <div class="cal-header">Time</div>
                        <div class="cal-header">Today</div>
                        {#each HOURS as hour}
                            <div class="time-label">{formatHour(hour)}</div>
                            {@const prob = occupancy[currentDay]?.[hour] ?? 0}
                            {@const currentRoomData = campusData[currentCampus].buildings[currentBuilding].rooms[currentRoom]}
                            <div class="hour-cell {probClass(prob)} {hour === currentHour ? 'is-now ' + (currentRoomData.currentlyOccupied ? 'is-now-busy' : 'is-now-free') : ''}">
                            {#if hour === currentHour}
                                {currentRoomData.currentlyOccupied ? 'Occupied' : 'Free'}
                            {:else}
                                {Math.round(prob * 100)}%
                            {/if}
                        </div>
                        {/each}
                    </div>

                {:else}
                    <div class="calendar-grid weekly">
                        <div class="cal-header">Time</div>
                        {#each DAYS as day}<div class="cal-header">{day}</div>{/each}
                        {#each HOURS as hour}
                            <div class="time-label">{formatHour(hour)}</div>
                            {#each DAYS as day}
                                {@const prob = occupancy[day]?.[hour] ?? 0}
                                {@const currentRoomData = campusData[currentCampus].buildings[currentBuilding].rooms[currentRoom]}
                                <div class="hour-cell {probClass(prob)} {hour === currentHour && day === currentDay ? 'is-now ' + (currentRoomData.currentlyOccupied ? 'is-now-busy' : 'is-now-free') : ''}">
                                    {#if hour === currentHour && day === currentDay}
                                        {currentRoomData.currentlyOccupied ? 'Occupied' : 'Free'}
                                    {:else}
                                        {Math.round(prob * 100)}%
                                    {/if}
                                </div>
                            {/each}
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- ── Status toast ───────────────────────────────────────────────────── -->
    <div class="status-message" class:show={statusVisible} role="status" aria-live="polite">
        {statusMessage}
    </div>
</div>

<style>
    :global(:root) {
        --rutgers-red:      #cc0033;
        --rutgers-red-dark: #a80000;
        --color-bg-primary: #f5f5f5;
        --color-surface:    #ffffff;
        --color-text-primary:   #1f2121;
        --color-text-secondary: #626c71;
        --color-border: rgba(94, 82, 64, 0.2);
        --shadow-sm: 0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.02);
        --shadow-md: 0 4px 6px -1px rgba(0,0,0,.04), 0 2px 4px -1px rgba(0,0,0,.02);
        --shadow-lg: 0 10px 15px -3px rgba(0,0,0,.04), 0 4px 6px -2px rgba(0,0,0,.02);
    }

    @media (prefers-color-scheme: dark) {
        :global(:root) {
            --color-bg-primary:     #1f2121;
            --color-surface:        #262828;
            --color-text-primary:   #f5f5f5;
            --color-text-secondary: #a7a9a9;
            --color-border: rgba(119, 124, 124, 0.3);
        }
    }

    :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }

    :global(body) {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
        line-height: 1.6;
        min-height: 100vh;
    }

    .app { min-height: 100vh; }

    .container {
        max-width: 100%;
        margin: 0 auto;
        padding: 1.5rem;
    }

    header {
        text-align: center;
        margin-bottom: 2rem;
    }

    h1 {
        color: var(--rutgers-red);
        font-size: 2rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }

    .subtitle {
        color: var(--color-text-secondary);
        font-size: 0.95rem;
    }

    .center { display: flex; justify-content: center; padding: 2rem; }

    .error-msg {
        color: var(--rutgers-red);
        text-align: center;
        padding: 2rem;
    }

    .empty-msg {
        text-align: center;
        color: var(--color-text-secondary);
        padding: 2rem;
    }

    /* ── Search ──────────────────────────────────────────────────────────── */
    .search-wrapper {
        position: relative;
        max-width: 480px;
        margin: 0 auto 2rem;
    }

    .search-input {
        width: 100%;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        border: 2px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-primary);
        font-size: 1rem;
        transition: border-color 0.2s;
        outline: none;
    }
    .search-input:focus { border-color: var(--rutgers-red); }

    .search-results {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        list-style: none;
        max-height: 280px;
        overflow-y: auto;
        z-index: 100;
    }

    .search-result-item {
        display: flex;
        flex-direction: column;
        padding: 0.75rem 1rem;
        cursor: pointer;
        border-bottom: 1px solid var(--color-border);
        transition: background 0.15s;
    }
    .search-result-item:last-child { border-bottom: none; }
    .search-result-item:hover { background: rgba(204, 0, 51, 0.07); }

    .result-room {
        font-weight: 600;
        color: var(--rutgers-red);
        font-size: 0.95rem;
    }
    .result-meta {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        margin-top: 0.15rem;
    }

    .search-no-results {
        padding: 0.75rem 1rem;
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        text-align: center;
    }

    /* ── Nav buttons row ─────────────────────────────────────────────────── */
    .nav-buttons {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
    }

    /* ── Back / Home buttons ─────────────────────────────────────────────── */
    .back-btn, .home-btn {
        background: var(--rutgers-red);
        color: white;
        border: none;
        padding: 0.875rem 1.75rem;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1.05rem;
        margin-bottom: 1.5rem;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        transition: background 0.2s;
        font-weight: 500;
        min-height: 48px;
        min-width: 120px;
        touch-action: manipulation;
    }
    .back-btn:hover, .home-btn:hover  { background: var(--rutgers-red-dark); }
    .back-btn:focus-visible, .home-btn:focus-visible {
        outline: 3px solid rgba(204, 0, 51, 0.5);
        outline-offset: 3px;
    }


    /* ── Cards ───────────────────────────────────────────────────────────── */
    .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
        margin-top: 1.5rem;
    }

    .card {
        background: var(--color-surface);
        border-radius: 12px;
        padding: 2rem 1.5rem;
        box-shadow: var(--shadow-md);
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
        text-align: center;
        border: 1px solid var(--color-border);
        min-height: 120px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        touch-action: manipulation;
    }
    .card:hover  { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
    .card:active { transform: translateY(-2px); background: rgba(204,0,51,.05); }
    .card:focus-visible { outline: 3px solid var(--rutgers-red); outline-offset: 2px; }

    .card h2 {
        color: var(--rutgers-red);
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
        font-weight: 600;
    }
    .card p { color: var(--color-text-secondary); font-size: 0.9rem; }

    .card-icon {
        font-size: 3rem;
        margin-bottom: 0.75rem;
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(204, 0, 51, 0.1);
        border-radius: 12px;
    }

    /* ── Room status badges ───────────────────────────────────────────────── */
    .room-status {
        margin-top: 0.5rem;
        font-size: 0.85rem;
        font-weight: 500;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .status-free   { background: #e8f5e9; color: #1b5e20 !important; }
    .status-mixed  { background: #fff9c4; color: #f57f17 !important; }
    .status-busy   { background: #ffebee; color: #b71c1c !important; }
    .status-neutral{ background: #eceff1; color: #455a64 !important; }

    /* ── Calendar ────────────────────────────────────────────────────────── */
    .calendar-controls {
        margin-bottom: 1.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
    }

    .view-toggle {
        padding: 0.5rem 1rem;
        border-radius: 8px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-primary);
        font-size: 0.95rem;
        cursor: pointer;
    }

    .legend {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        font-size: 0.85rem;
    }
    .legend-item { display: flex; align-items: center; gap: 0.5rem; }
    .legend-box  {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        border: 1px solid var(--color-border);
    }

    .calendar {
        background: var(--color-surface);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: var(--shadow-md);
        overflow-x: auto;
    }

    .calendar-grid {
        display: grid;
        grid-template-columns: 80px repeat(7, 1fr);
        gap: 0.5rem;
        min-width: 600px;
    }
    .calendar-grid.daily { grid-template-columns: 80px 1fr; }

    .cal-header {
        padding: 0.75rem 0.5rem;
        text-align: center;
        font-weight: 600;
        border-radius: 6px;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
    }

    .time-label {
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 500;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
    }

    .hour-cell {
        min-height: 56px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
        border: 1px solid var(--color-border);
        transition: transform 0.1s;
        font-weight: 500;
        cursor: pointer;
        touch-action: manipulation;
    }
    .hour-cell:hover       { box-shadow: 0 2px 8px rgba(0,0,0,.15); }
    .hour-cell:focus-visible { outline: 2px solid var(--rutgers-red); outline-offset: 2px; }

    .prob-0        { background: #ffffff; color: #666; }
    .prob-25       { background: #e3f2fd; color: #1976d2; }
    .prob-50       { background: #90caf9; color: #0d47a1; }
    .prob-75       { background: #42a5f5; color: white; }
    .prob-100      { background: #1565c0; color: white; }

    @media (prefers-color-scheme: dark) {
        .prob-0   { background: #2a2a2a; color: #666; }
        .prob-25  { background: #162336; color: #64b5f6; }
        .prob-50  { background: #173658; color: #90caf9; }
        .prob-75  { background: #1a5a9e; color: #ddeeff; }
        .prob-100 { background: #1565c0; color: #ffffff; }
    }

    /* ── Loading spinner ─────────────────────────────────────────────────── */
    .loading-indicator {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(204, 0, 51, 0.3);
        border-radius: 50%;
        border-top-color: var(--rutgers-red);
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Status toast ────────────────────────────────────────────────────── */
    .status-message {
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-surface);
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        border: 1px solid var(--color-border);
        z-index: 1000;
        display: none;
    }
    .status-message.show {
        display: block;
        animation: slideUp 0.3s ease-out;
    }
    @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
    }

    /* ── Responsive ──────────────────────────────────────────────────────── */
    @media (max-width: 768px) {
        .container { padding: 1rem 1rem 2rem; }
        h1 { font-size: 1.75rem; }
        .cards { grid-template-columns: 1fr; gap: 1rem; }
        .card  { min-height: 100px; }
        .nav-buttons {
            position: sticky;
            top: 1rem;
            z-index: 10;
        }
        .back-btn, .home-btn {
            flex: 1;
            justify-content: center;
        }
        .calendar-grid       { grid-template-columns: 60px repeat(7, 1fr); }
        .calendar-grid.daily { grid-template-columns: 60px 1fr; }
        .cal-header  { font-size: 0.85rem; padding: 0.625rem 0.25rem; }
        .hour-cell   { font-size: 0.85rem; min-height: 52px; }
    }

    @media (max-width: 480px) {
        .legend     { font-size: 0.8rem; }
        .legend-box { width: 18px; height: 18px; }
        .back-btn, .home-btn { font-size: 1rem; padding: 0.875rem 1.5rem; }
    }

    /* ── Occupancy banner ────────────────────────────────────────────────── */
    .occupancy-banner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 1.25rem;
        border-radius: 10px;
        margin-bottom: 1.5rem;
        border: 1px solid;
        font-size: 0.95rem;
    }
    .banner-free  { background: #e8f5e9; border-color: #a5d6a7; color: #1b5e20; }
    .banner-busy  { background: #ffebee; border-color: #ef9a9a; color: #b71c1c; }

    .banner-dot {
        width: 10px; height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
        animation: pulse 1.8s ease-in-out infinite;
    }
    .banner-free .banner-dot  { background: #2e7d32; }
    .banner-busy .banner-dot  { background: #c62828; }

    @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1);    }
        50%       { opacity: 0.6; transform: scale(1.25); }
    }

    .banner-text { font-weight: 600; }
    .banner-sub  { margin-left: auto; font-size: 0.8rem; opacity: 0.7; }

    @media (prefers-color-scheme: dark) {
        .banner-free { background: #1a3320; border-color: #2e7d32; color: #a5d6a7; }
        .banner-busy { background: #3b1a1a; border-color: #c62828; color: #ef9a9a; }
    }

    /* ── Current-hour highlight ──────────────────────────────────────────── */
    .hour-cell.is-now {
        outline: 3px solid var(--rutgers-red);
        outline-offset: -2px;
        font-weight: 700;
    }
    .hour-cell.is-now-free {
        background: #e8f5e9 !important;
        color: #1b5e20 !important;
    }
    .hour-cell.is-now-busy {
        background: #ffebee !important;
        color: #b71c1c !important;
    }

    @media (prefers-color-scheme: dark) {
        .hour-cell.is-now-free { background: #1a3320 !important; color: #a5d6a7 !important; }
        .hour-cell.is-now-busy { background: #3b1a1a !important; color: #ef9a9a !important; }
    }

</style>