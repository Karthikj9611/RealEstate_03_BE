const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ── MongoDB ──
//mongoose.connect("mongodb://127.0.0.1:27017/kr_realestate")
mongoose.connect("mongodb+srv://karthikj:karthikj@cluster0.hkz6yzz.mongodb.net/kr_realestate?retryWrites=true&w=majority")
  .then(async () => { console.log("✅ MongoDB Connected"); await seedAdmin(); })
  .catch(err => console.log("❌ MongoDB error:", err));

// ── SCHEMAS ──
const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName:  { type: String, default: "" },
  email:     { type: String, unique: true, required: true },
  mobile:    { type: String, default: "" },
  password:  { type: String },
  role:      { type: String, default: "user", enum: ["user","admin"] },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", UserSchema);

const PropertySchema = new mongoose.Schema({
  title:       { type: String, required: true },
  loc:         { type: String, required: true },
  city:        { type: String, default: "Bengaluru" },
  price:       { type: Number, required: true },
  displayPrice:{ type: String, required: true },
  bhk:         { type: Number, required: true },
  area:        String, status: { type: String, enum:["For Sale","For Rent","New Launch","Sold"], default:"For Sale" },
  furnishing:  { type: String, default: "Unfurnished" },
  floor: String, floorLevel: String, age: String, facing: String,
  carparking: String, bikeparking: String, toilet: String,
  amenities: [String], images: [String], desc: String, color: String, icon: String,
  createdAt: { type: Date, default: Date.now }
});
const Property = mongoose.model("Property", PropertySchema);

const ReviewSchema = new mongoose.Schema({
  name: String, role: String, comment: String,
  rating: { type: Number, min:1, max:5, required:true },
  createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model("Review", ReviewSchema);

// ── OTP STORE (in-memory) ──
const otpStore = {};

// ── EMAIL ──
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: "karthikram1391@gmail.com", pass: "gsbisdrdqoyzqoln" }
});

// ── SEED ADMIN ──
async function seedAdmin() {
  try {
    const exists = await User.findOne({ email: "admin" });
    if (!exists) {
      const hashed = await bcrypt.hash("admin", 10);
      await new User({ firstName:"Admin", lastName:"", email:"admin", mobile:"0000000000", password:hashed, role:"admin" }).save();
      console.log("✅ Admin seeded  (login: admin / admin)");
    }
  } catch(e) { console.log("Admin seed skipped:", e.message); }
}

// ══════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════

// SEND OTP
app.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email required"
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore[email] = {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  try {
    await transporter.sendMail({
      from: '"KR Real Estate" <karthikram1391@gmail.com>',
      to: email,
      subject: "Your OTP — KR Real Estate",
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0">
        <div style="background:linear-gradient(135deg,#1b3a2d,#2e7d5a);padding:22px 24px;text-align:center">
          <h2 style="margin:0;color:#fff;font-size:1.4rem">KR Real Estate</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:0.8rem">Email Verification</p>
        </div>
        <div style="padding:28px 24px;text-align:center">
          <p style="color:#555;margin-bottom:18px">Your One-Time Password:</p>
          <div style="font-size:2.4rem;font-weight:800;letter-spacing:10px;background:#f0f9f4;padding:16px 20px;border-radius:10px;display:inline-block;color:#1b3a2d;border:2px dashed #2e7d5a">${otp}</div>
          <p style="color:#999;font-size:0.8rem;margin-top:16px">Valid for <strong>5 minutes</strong>. Do not share this OTP.</p>
        </div>
        <div style="background:#f9f9f9;padding:12px;text-align:center;font-size:0.72rem;color:#bbb">
          © ${new Date().getFullYear()} KR Real Estate
        </div>
      </div>`
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Mail error FULL:", err);
    res.json({
      success: false,
      message: err.message || "Failed to send email."
    });
  }
});

// VERIFY OTP
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore[email];
  if (!record) return res.json({ success:false, message:"No OTP found. Please request again." });
  if (Date.now() > record.expiresAt) { delete otpStore[email]; return res.json({ success:false, message:"OTP expired." }); }
  if (record.otp !== String(otp)) return res.json({ success:false, message:"Incorrect OTP." });
  delete otpStore[email];
  res.json({ success: true });
});

// REGISTER
app.post("/submit", async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, password } = req.body;
    if (!firstName || !lastName || !email || !mobile) return res.status(400).json({ message:"All fields are required." });
    if (!password || password.length < 6) return res.status(400).json({ message:"Password must be at least 6 characters." });
    const exists = await User.findOne({ email: email.trim().toLowerCase() });
    if (exists) return res.status(400).json({ message:"An account with this email already exists. Please sign in." });
    const hashed = await bcrypt.hash(password, 10);
    const user = await new User({ firstName:firstName.trim(), lastName:lastName.trim(), email:email.trim().toLowerCase(), mobile:mobile.trim(), password:hashed, role:"user" }).save();
    res.json({ message:"Account created! Welcome to KR Real-Estate.", firstName:user.firstName, lastName:user.lastName });
  } catch(err) {
    console.error("Register error:", err);
    res.status(500).json({ message:"Server error. Please try again." });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message:"Email and password are required." });
    const emailLower = email.trim().toLowerCase();
    // Hardcoded admin fallback
    if (emailLower === "admin" && password === "admin") {
      return res.json({ firstName:"Admin", lastName:"", isAdmin:true, role:"admin" });
    }
    const user = await User.findOne({ email: emailLower });
    if (!user) return res.status(401).json({ message:"No account found with this email. Please register first." });
    if (!user.password) return res.status(401).json({ message:"Password not set. Please register again." });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message:"Incorrect password. Please try again." });
    res.json({ firstName:user.firstName, lastName:user.lastName||"", isAdmin:user.role==="admin", role:user.role });
  } catch(err) {
    console.error("Login error:", err);
    res.status(500).json({ message:"Server error." });
  }
});

// USERS
app.get("/api/users", async (req, res) => {
  try { res.json(await User.find({},"-password").sort({createdAt:-1})); }
  catch(err) { res.status(500).json([]); }
});
app.delete("/api/users/mobile/:mobile", async (req, res) => {
  try {
    const deleted = await User.findOneAndDelete({ mobile: req.params.mobile });
    if (!deleted) return res.status(404).json({ message:"User not found" });
    res.json({ message:"Deleted successfully" });
  } catch(err) { res.status(500).json({ message:"Server error" }); }
});

// PROPERTIES
app.get("/api/properties", async (req, res) => {
  try { res.json(await Property.find().sort({createdAt:-1})); }
  catch(err) { res.status(500).json([]); }
});
app.post("/api/properties", async (req, res) => {
  try {
    const prop = new Property(req.body);
    await prop.save();
    res.json({ message:"Property added successfully!" });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message:"Error saving property: " + err.message });
  }
});

// REVIEWS
app.get("/api/reviews", async (req, res) => {
  try { res.json(await Review.find().sort({createdAt:-1})); }
  catch(err) { res.status(500).json([]); }
});
app.post("/api/reviews", async (req, res) => {
  try {
    const { name, role, comment, rating } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message:"Rating must be 1–5" });
    if (!comment || !comment.trim()) return res.status(400).json({ message:"Review comment required" });
    await new Review({ name, role, comment, rating }).save();
    res.json({ message:"Review submitted successfully!" });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message:"Error saving review" });
  }
});

// FRONTEND
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found"
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
