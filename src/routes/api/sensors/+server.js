import { json } from "@sveltejs/kit";
import { MongoClient, ServerApiVersion } from "mongodb";
import { MONGO_URL } from "$env/static/private";

export async function GET({ url }) {
    // Get GET request parameters
    const room_names = url.searchParams.getAll("room_name");
    console.log("Room Names: " + room_names);

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
        if (room_names.length > 0)
            query.room_name = { $in: room_names };
        const data = await db.collection("sensors").find(query).toArray();

        console.log("Successfully retrieved from MongoDB");
        return json(data);
    } catch (error) {
        console.error("Error connecting to MongoDB: ", error);
        return json({ status: 500 });
    }
    finally {
        await client.close();
    }
}

export async function POST({ request }) {
    // Get POST data
    const { sensor_id, campus, room_name } = await request.json();
    console.log("Sensor ID: " + sensor_id);
    console.log("Campus: " + campus);
    console.log("room_name: " + room_name);
    if (sensor_id == null) {
        console.log("Missing sensor_id");
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

        // Two possible operations: add new sensor or update existing sensor
        // Check if sensor already exists
        const new_sensor = await db.collection("sensors").findOne({ _id: sensor_id }) == null;

        // Operation 1: add new sensor to database
        if (new_sensor) {
            // If adding a new sensor, all pertinent fields are required
            if (campus == null || room_name == null) {
                console.log("Missing campus or room_name");
                return json({ status: 400 });
            }
            
            await db.collection("sensors").insertOne({
                _id: sensor_id,
                campus: campus,
                room_name: room_name
            });
        }
        // Operation 2: update existing sensor's information
        else {
            const fields = {};
            if (campus != null)
                fields.campus = campus;
            if (room_name != null)
                fields.room_name = room_name;
        
            await db.collection("sensors").updateOne(
                { _id: sensor_id },
                { $set: fields }
            );
        }

        console.log("Successfully inserted to MongoDB");
    } catch (error) {
        console.error("Error connecting to MongoDB: ", error);
        return json({ status: 500 });
    }
    finally {
        await client.close();
    }
    return json({ status: 201 });
}