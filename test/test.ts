import PolyMongo  from "../dist/index";
import mongoose from "mongoose";

// 1. Define your schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
});

// 2. Initialize PolyMongo
const db = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017",
  defaultDB: "production",
  maxPoolSize: 10,
  debug: true,
});

// 3. Wrap your model
const User = mongoose.model("User", userSchema);
const WrappedUser = db.wrapModel(User);

// 4. Use it anywhere - production DB
const users = await WrappedUser.find({ role: "admin" });

// 5. Or switch databases on-the-fly
const testUsers = await WrappedUser.db("testing").find();
const analyticsUsers = await WrappedUser.db("analytics").find();