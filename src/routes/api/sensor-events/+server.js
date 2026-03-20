import { json } from "@sveltejs/kit";
import { MongoClient, ServerApiVersion } from "mongodb";
import { MONGO_URL } from "$env/static/private";

export async function POST({ request }) {
    const { sensor_id, timestamp, occupied } = await request.json();

    console.log("Hello, World!");
    console.log("Sensor ID: " + sensor_id);
    console.log("Timestamp: " + timestamp);
    console.log("Occupied: " + occupied);

    const client = new MongoClient(MONGO_URL, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
    });

    try {
        await client.connect();
        // Add sensor event to collection "sensor_events"
        await client.db("ru_occupied").collection("sensor_events").insertOne({
            sensor_id: sensor_id,
            timestamp: new Date(timestamp),
            occupied: occupied
        });
        // Also need to update current status of sensor in collection "sensors"
        console.log("Successfully inserted to MongoDB");
    }
    catch (error) {
        console.error("Error connecting to MongoDB: ", error);
    }
    finally {
        await client.close();
    }
    return json({ status: 201 });
}