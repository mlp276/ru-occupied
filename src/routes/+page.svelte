<script>
    import { onMount } from 'svelte';

    // ─── API Configuration ────────────────────────────────────────────────────
    // Change this one constant to point to a different backend deployment.
    const API_BASE_URL = 'https://ru-occupied.vercel.app';
    // ─────────────────────────────────────────────────────────────────────────

    const CAMPUS_NAMES = {
        'busch':       'Busch Campus',
        'livingston':  'Livingston Campus',
        'college-ave': 'College Avenue Campus',
        'cook-doug':   'Cook/Douglass Campus'
    };

    const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

    function goToRoom(room) {
        currentRoom = room;
        occupancy = generateMockOccupancy();
        navigationStack = [...navigationStack, page];
        page = 'calendar';
    }

    // ─── Derived selections ──────────────────────────────────────────────────
    $: selectedCampus   = currentCampus   ? campusData[currentCampus]                              : null;
    $: selectedBuilding = selectedCampus  ? selectedCampus.buildings[currentBuilding]              : null;
    $: roomTitle        = selectedBuilding ? `${selectedBuilding.name} — Room ${currentRoom}`      : '';

    // ─── Room status badge helpers ────────────────────────────────────────────
    function roomStatus(prob) {
        if (prob < 0.3) return { label: 'Likely Free',     cls: 'status-free'    };
        if (prob < 0.7) return { label: 'Maybe Busy',      cls: 'status-mixed'   };
        return              { label: 'Likely Occupied',  cls: 'status-busy'    };
    }

    // ─── Calendar helpers ────────────────────────────────────────────────────
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
        return h <= 12 ? `${h}AM` : `${h - 12}PM`;
    }

    $: currentHour = new Date().getHours();
    $: currentDay  = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]; // Mon=0 index

    // ─── API fetch on mount ──────────────────────────────────────────────────
    onMount(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/sensors`);
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const sensors = await res.json();

            const built = {};
            sensors.forEach(({ campus, room_name }) => {
                if (!campus || !room_name) return;

                if (!built[campus]) {
                    built[campus] = {
                        name: CAMPUS_NAMES[campus] || campus,
                        buildings: {}
                    };
                }

                // Placeholder building until schema has a building field
                if (!built[campus].buildings[campus]) {
                    built[campus].buildings[campus] = {
                        name: CAMPUS_NAMES[campus] || campus,
                        rooms: []
                    };
                }

                const rooms = built[campus].buildings[campus].rooms;
                if (!rooms.includes(room_name)) rooms.push(room_name);
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
                <p class="subtitle">Check classroom availability across Rutgers campuses</p>
            </header>

            {#if loading}
                <div class="center"><div class="loading-indicator"></div></div>

            {:else if loadError}
                <p class="error-msg">Failed to load campus data. Please try again later.</p>

            {:else if Object.keys(campusData).length === 0}
                <p class="empty-msg">No sensor data available.</p>

            {:else}
                <div class="cards">
                    {#each Object.entries(campusData) as [campusId, campus]}
                        {@const totalRooms = Object.values(campus.buildings).reduce((s, b) => s + b.rooms.length, 0)}
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
            <button class="back-btn" on:click={navigateBack}>← Back</button>
            <header><h1>{selectedCampus.name}</h1></header>
            <div class="cards">
                {#each Object.entries(selectedCampus.buildings) as [buildingId, building]}
                    <div
                        class="card"
                        role="button"
                        tabindex="0"
                        aria-label="View {building.name}, {building.rooms.length} rooms"
                        on:click={() => goToBuilding(buildingId)}
                        on:keypress={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToBuilding(buildingId); }}}
                    >
                        <div class="card-icon">🏢</div>
                        <h2>{building.name}</h2>
                        <p>{building.rooms.length} room{building.rooms.length !== 1 ? 's' : ''}</p>
                    </div>
                {/each}
            </div>
        </div>

    <!-- ── Rooms page ────────────────────────────────────────────────────── -->
    {:else if page === 'rooms' && selectedBuilding}
        <div class="container">
            <button class="back-btn" on:click={navigateBack}>← Back</button>
            <header><h1>{selectedBuilding.name}</h1></header>
            <div class="cards">
                {#each selectedBuilding.rooms as room}
                    {@const prob   = Math.random()}
                    {@const status = roomStatus(prob)}
                    <div
                        class="card"
                        role="button"
                        tabindex="0"
                        aria-label="View occupancy for Room {room}, status: {status.label}"
                        on:click={() => goToRoom(room)}
                        on:keypress={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToRoom(room); }}}
                    >
                        <div class="card-icon">🚪</div>
                        <h2>Room {room}</h2>
                        <p class="room-status {status.cls}">{status.label}</p>
                    </div>
                {/each}
            </div>
        </div>

    <!-- ── Calendar page ─────────────────────────────────────────────────── -->
    {:else if page === 'calendar' && currentRoom}
        <div class="container">
            <button class="back-btn" on:click={navigateBack}>← Back</button>
            <header><h1>{roomTitle}</h1></header>

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
                    <div class="legend-item">
                        <div class="legend-box" style="background:#2c2c2c;"></div>
                        <span>Past: Occupied</span>
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
                            {#if hour < currentHour}
                                {@const prob = occupancy[currentDay]?.[hour] ?? 0}
                                <div class="hour-cell {prob > 0.5 ? 'past-occupied' : 'past-empty'}">
                                    {prob > 0.5 ? 'Occupied' : 'Empty'}
                                </div>
                            {:else}
                                {@const prob = occupancy[currentDay]?.[hour] ?? 0}
                                <div class="hour-cell {probClass(prob)}">
                                    {Math.round(prob * 100)}%
                                </div>
                            {/if}
                        {/each}
                    </div>

                {:else}
                    <div class="calendar-grid weekly">
                        <div class="cal-header">Time</div>
                        {#each DAYS as day}<div class="cal-header">{day}</div>{/each}
                        {#each HOURS as hour}
                            <div class="time-label">{formatHour(hour)}</div>
                            {#each DAYS as day}
                                {@const prob   = occupancy[day]?.[hour] ?? 0}
                                {@const isPast = day === currentDay && hour < currentHour}
                                {#if isPast}
                                    <div class="hour-cell {prob > 0.5 ? 'past-occupied' : 'past-empty'}">
                                        {prob > 0.5 ? '✓' : '✗'}
                                    </div>
                                {:else}
                                    <div class="hour-cell {probClass(prob)}">
                                        {Math.round(prob * 100)}%
                                    </div>
                                {/if}
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

    /* ── Back button ─────────────────────────────────────────────────────── */
    .back-btn {
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
    .back-btn:hover  { background: var(--rutgers-red-dark); }
    .back-btn:focus-visible {
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
    .status-free   { background: #e8f5e9; color: #1b5e20; }
    .status-mixed  { background: #fff9c4; color: #f57f17; }
    .status-busy   { background: #ffebee; color: #b71c1c; }
    .status-neutral{ background: #eceff1; color: #455a64; }

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
        background: rgba(204, 0, 51, 0.1);
        padding: 0.75rem 0.5rem;
        text-align: center;
        font-weight: 600;
        border-radius: 6px;
        font-size: 0.9rem;
        color: var(--rutgers-red);
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
    .hour-cell:hover       { transform: scale(1.05); box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    .hour-cell:focus-visible { outline: 2px solid var(--rutgers-red); outline-offset: 2px; }

    .past-empty    { background: white;   color: #999; }
    .past-occupied { background: #2c2c2c; color: white; }
    .prob-0        { background: #ffffff; color: #666; }
    .prob-25       { background: #e3f2fd; color: #1976d2; }
    .prob-50       { background: #90caf9; color: #0d47a1; }
    .prob-75       { background: #42a5f5; color: white; }
    .prob-100      { background: #1565c0; color: white; }

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
        .back-btn {
            position: sticky;
            top: 1rem;
            z-index: 10;
            width: 100%;
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
        .back-btn   { font-size: 1rem; padding: 0.875rem 1.5rem; }
    }
</style>
