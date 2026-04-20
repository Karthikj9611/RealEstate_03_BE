const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 🔗 Connect MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/kr_realestate")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// 📦 Schema
const UserSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  mobile: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);

// 🚀 API
app.post("/submit", async (req, res) => {
  try {
    const { firstName, lastName, email, mobile } = req.body;

    if (!firstName || !lastName || !email || !mobile) {
      return res.status(400).json({ message: "All fields required" });
    }

    const newUser = new User({ firstName, lastName, email, mobile });
    await newUser.save();

    res.json({ message: "Saved successfully" });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});
app.use(express.static("public"));
// Start server
const PORT = process.env.PORT || 5000;


const path = require("path");

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));