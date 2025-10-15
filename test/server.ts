// test/server.ts
import express, { Request, Response } from 'express';
import mongoose, { Schema } from 'mongoose';
import PolyMongo from '../src/index'; // adjust path to your TS package

const app = express();
app.use(express.json());

// Create PolyMongo wrapper instance
const wrapper = PolyMongo.createWrapper({
    mongoURI: 'mongodb://localhost:27017',
    minFreeConnections: 1,
    maxPoolSize: 1,
    defaultDB: 'test',
    idleTimeoutMS: 30000,
    debug: true,
    coldStart: true
});



interface IUser extends mongoose.Document {
    name: string;
}
const userSchema = new Schema<IUser>({ name: { type: String, required: true } });

const User = wrapper.wrapModel(mongoose.model<IUser>('User', userSchema));

// Query users from a default database
app.get('/users', async (_req: Request, res: Response) => {
    const users = await User.find().limit(20).sort({ name: -1 }).lean();
    res.json(users);
});

// Get wrapper stats
app.get('/stats', (_req: Request, res: Response) => {
    res.json(wrapper.stats());
});


app.post('/add-user', async (req: Request, res: Response) => {
    const { name, db } = req.body as { name?: string; db?: string };
    await User.db(db).create({ name });
    res.send("USER ADDED");
});


// Watch changes (SSE)
app.get('/watch/:db', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    const changeStream = User.watch();

    changeStream.on('change', change => {
        res.write(`data: ${JSON.stringify(change)}\n\n`);
    });

    req.on('close', () => {
        changeStream.close();
    });
});

// Start server
app.listen(3000, () => console.log('Server running on port 3000'));




// /*
// For Production:
//     Models/index.js
//     -------------------
//     1. Create a single PolyMongo wrapper instance.
//     2. Wrap all your mongoose models using this instance.
//     3. Export the wrapped models for use in your application.

//     Example:

//     1. Create Wrapper Instance
//     -------------------
//     const wrapper = PolyMongo.createWrapper({
//         mongoURI: 'your-mongodb-uri',
//         ...OTHER OPTIONS...
//     });

//     2. Wrap Models
//     -------------------
//     import User from './User';
//     import Product from './Product';
//     const WrappedUser = wrapper.wrapModel(User);
//     const WrappedProduct = wrapper.wrapModel(Product);

//     3. Export Wrapped Models
//     -------------------
//     module.exports = { WrappedUser, WrappedProduct };


//     This Way you can easily adapt your existing mongoose models to use multiple databases with minimal changes.
// */