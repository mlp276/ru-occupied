import { json } from "@sveltejs/kit";
import { MongoClient, ServerApiVersion } from "mongodb";
import { MONGO_URL } from "$env/static/private";

// ─── CORS Configuration ──────────────────────────────────────────────────────
// '*' allows any origin to call this API (suitable for a public-facing tool).
// If you need to restrict access, replace '*' with a specific origin, e.g.:
// 'https://your-frontend-domain.com'
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};
// ─────────────────────────────────────────────────────────────────────────────

// Handle preflight requests sent by the browser before GET/POST
export async function OPTIONS() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Retrieve sensor metadata from the database
export async function GET({ url }) {
    const rooms = url.searchParams.getAll("room");
    console.log("Rooms: " + rooms);

    // Create database client
    const client = new MongoClient(MONGO_URL, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true
        }
    });
    
    // Retrieve data from database
    try {
        await client.connect();
        const db = client.db("ru_occupied");
        
        // Retrieve data for specified room names
        // If no room names specified, then retrieve data for all rooms
        const query = {};
        if (rooms.length > 0) query.room_name = { $in: rooms };
        const data = await db.collection("sensors").find(query).toArray();

        console.log("Successfully retrieved from MongoDB");
        return json(data, { headers: CORS_HEADERS });
    } catch (error) {
        console.error("Error connecting to MongoDB: ", error);
        return new Response(null, { status: 500, headers: CORS_HEADERS });
    }
    finally {
        await client.close();
    }
}

// Add/update sensor metadata to the database
export async function POST({ request }) {
    // Get POST data
    const { sensor_id, campus, building, room } = await request.json();
    console.log("Sensor ID: " + sensor_id);
    console.log("Campus: " + campus);
    console.log("Building: " + building);
    console.log("Room: " + room);
    if (sensor_id == null) {
        console.log("Missing sensor id");
        return new Response(null, { status: 400, headers: CORS_HEADERS });
    }
    
    // Create database client
    const client = new MongoClient(MONGO_URL, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true
            }
    });

    // Add data to database
    try {
        await client.connect();
        const db = client.db("ru_occupied");

        // Check if sensor already exists
        const new_sensor = await db.collection("sensors").findOne({ _id: sensor_id }) == null;

        if (new_sensor) {
            // Operation 1: add new sensor to database
            // If adding a new sensor, all pertinent fields are required
            if (campus == null || room == null) {
                console.log("Missing campus or room");
                return new Response(null, { status: 400, headers: CORS_HEADERS });
            }
            
            await db.collection("sensors").insertOne({
                _id: sensor_id,
                campus: campus,
                room: room
            });
        }
        else {
            // Operation 2: update existing sensor's information
            const fields = {};
            if (campus != null) fields.campus = campus;
            if (building != null) fields.building = building;
            if (room != null) fields.room = room;
        
            await db.collection("sensors").updateOne(
                { _id: sensor_id },
                { $set: fields }
            );
        }

        console.log("Successfully inserted to MongoDB");
    } catch (error) {
        console.error("Error connecting to MongoDB: ", error);
        return new Response(null, { status: 500, headers: CORS_HEADERS });
    }
    finally {
        await client.close();
    }
    
    return new Response(null, { status: 201, headers: CORS_HEADERS });
}