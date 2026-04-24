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


// ── PROPERTY SCHEMA ──
const PropertySchema = new mongoose.Schema({
  title:        { type: String, required: true },
  loc:          { type: String, required: true },
  city:         { type: String, default: "Bengaluru" },
  price:        { type: Number, required: true },
  displayPrice: { type: String, required: true },
  bhk:          { type: Number, required: true },
  area:         { type: String },
  status:       { type: String, enum: ["For Sale","For Rent","New Launch","Sold"], default: "For Sale" },
  furnishing:   { type: String, default: "Unfurnished" },
  floor:        { type: String },
  floorLevel:   { type: String },
  age:          { type: String },
  facing:       { type: String },
  parking:      { type: String },
  toilet:       { type: String },
  amenities:    [String],
  images:       [String],
  desc:         { type: String },
  color:        { type: String },
  icon:         { type: String },
  createdAt:    { type: Date, default: Date.now }
});

const Property = mongoose.model("Property", PropertySchema);

// GET all properties
app.get("/api/properties", async (req, res) => {
  try {
    const properties = await Property.find().sort({ createdAt: -1 });
    res.json(properties);
  } catch (err) {
    res.status(500).json([]);
  }
});

// POST a new property (admin use)
app.post("/api/properties", async (req, res) => {
  try {
    const prop = new Property(req.body);
    await prop.save();
    res.json({ message: "Property added successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error saving property" });
  }
});

// ✅ ADD THIS

const ReviewSchema = new mongoose.Schema({
  name: String,
  role: String,
  comment: String,
  rating: { type: Number, min: 1, max: 5, required: true },  // ADD THIS LINE
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
    const { name, role, comment, rating } = req.body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const newReview = new Review({ name, role, comment, rating });
    await newReview.save();

    res.json({ message: "Review submitted successfully!" });
  } catch (err) {
    console.error("Error saving review:", err);
    res.status(500).json({ message: "Error saving review" });
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


const nodemailer = require("nodemailer");

let otpStore = {}; // temporary store (use DB in production)

// transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "karthikram1391@gmail.com",
    pass: "gsbisdrdqoyzqoln"
  }
});


app.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore[email] = otp;

  try {
    await transporter.sendMail({
      from: '"KR Real Estate" <karthikram1391@gmail.com>',
      to: email,
      subject: "Your OTP for Verification",
      html: `
      <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:30px;">
        
        <div style="max-width:500px;margin:auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 5px 20px rgba(0,0,0,0.1);">
          
          <div style="background:#0d6efd;padding:20px;text-align:center;color:white;">
            <h2 style="margin:0;">KR Real Estate</h2>
            <p style="margin:0;font-size:14px;">Secure Verification</p>
          </div>

          <div style="padding:30px;text-align:center;">
            <h3>Your One-Time Password</h3>
            <p style="color:#555;">Use the OTP below to verify your email address</p>

            <div style="font-size:32px;font-weight:bold;letter-spacing:5px;
                        background:#f1f3f5;padding:15px;border-radius:8px;
                        display:inline-block;margin:20px 0;color:#0d6efd;">
              ${otp}
            </div>

            <p style="color:#777;font-size:14px;">
              This OTP is valid for <b>5 minutes</b>. Do not share it.
            </p>
          </div>

          <div style="background:#f8f9fa;padding:15px;text-align:center;font-size:12px;color:#999;">
            © ${new Date().getFullYear()} KR Real Estate<br/>
            If you didn’t request this, ignore this email.
          </div>

        </div>

      </div>
      `
    });

    res.json({ success: true });

  } catch (err) {
    console.log("Mail error:", err);
    res.json({ success: false });
  }
});

// VERIFY OTP
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (otpStore[email] === otp) {
    delete otpStore[email];
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));