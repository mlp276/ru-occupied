import { json } from "@sveltejs/kit";
import { MongoClient, ServerApiVersion } from "mongodb";
import { MONGO_URL } from "$env/static/private";

export async function POST({ request }) {
    // Get POST data
    const { sensor_id, timestamp, occupied } = await request.json();
    console.log("Sensor ID: " + sensor_id);
    console.log("Timestamp: " + timestamp);
    console.log("Occupied: " + occupied);
    if (sensor_id == null || timestamp == null || occupied == null) {
        console.log("Missing sensor_id, timestamp, or occupied");
        return json({ status: 400 });
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

        // Add sensor event to collection "sensor_events"
        await db.collection("sensor_events").insertOne({
            sensor_id: sensor_id,
            timestamp: new Date(timestamp),
            occupied: occupied
        });

        // Update current status of sensor in collection "sensors"
        await db.collection("sensors").updateOne(
            { _id: sensor_id },
            { $set: { currently_occupied: occupied } },
            { upsert: true }
        );
        
        console.log("Successfully inserted to MongoDB");
    }
    catch (error) {
        console.error("Error connecting to MongoDB: ", error);
        return json({ status: 500 });
    }
    finally {
        await client.close();
    }
    return json({ status: 201 });
}