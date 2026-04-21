const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 🔗 Connect MongoDB
//mongoose.connect("mongodb://127.0.0.1:27017/kr_realestate")
mongoose.connect("mongodb+srv://karthikj:karthikj@cluster0.hkz6yzz.mongodb.net/kr_realestate?retryWrites=true&w=majority")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// 📦 Schema
const UserSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, unique: true },
  mobile: { type: String, unique: true },
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

    // 🔍 Check email
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(400).json({
        message: "Email already exists"
      });
    }

    // 🔍 Check mobile
    const mobileExists = await User.findOne({ mobile });
    if (mobileExists) {
      return res.status(400).json({
        message: "Mobile number already exists"
      });
    }

    // ✅ Save new user
    const newUser = new User({ firstName, lastName, email, mobile });
    await newUser.save();

    res.json({ message: "Your details have been successfully submitted. Our team will contact you shortly." });

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


app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.log(err);
    res.status(500).json([]);
  }
});


// ✅ ADD THIS

const ReviewSchema = new mongoose.Schema({
  name: String,
  role: String,
  comment: String,
  createdAt: { type: Date, default: Date.now }
});

const Review = mongoose.model("Review", ReviewSchema);


// GET reviews
app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json([]);
  }
});

// POST review
app.post("/api/reviews", async (req, res) => {
  try {
    const { name, role, comment } = req.body;

    const newReview = new Review({ name, role, comment });
    await newReview.save();

    res.json({ message: "Saved" });
  } catch (err) {
    res.status(500).json({ message: "Error" });
  }
});

app.delete("/api/users/mobile/:mobile", async (req, res) => {
  try {
    const mobile = req.params.mobile;

    const deleted = await User.findOneAndDelete({ mobile });

    if (!deleted) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Deleted successfully" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));