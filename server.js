require('dotenv').config();
// Required .env variables:
// MONGODB_URI        - MongoDB Atlas connection string
// ADMIN_API_KEY      - Strong random secret for admin API access
// BREVO_API_KEY      - Brevo (Sendinblue) email API key
// RAZORPAY_KEY_ID    - Razorpay key ID
// RAZORPAY_KEY_SECRET- Razorpay key secret
// ALLOWED_ORIGIN     - Frontend URL for CORS (e.g. https://yourdomain.com). Defaults to * if not set.
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const path = require("path");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static("public"));

// ── MongoDB ──
//mongoose.connect("mongodb://127.0.0.1:27017/kr_realestate")
mongoose.connect(process.env.MONGODB_URI)
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
  remarks: [
  {
    remark: { type: String, default: "" },
    date: { type: Date, default: Date.now }
  }
],
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", UserSchema);

const PropertySchema = new mongoose.Schema({
  title:        { type: String, required: true },
  loc:          { type: String, required: true },
  city:         { type: String, default: "Bengaluru" },
  price:        { type: Number, required: true },
  displayPrice: { type: String, required: true },
  bhk:          { type: Number, required: true },
  area:         String,
  status:       { type: String, enum: ["For Sale","For Rent","New Launch","Sold","Lease","PG"], default: "For Sale" },
  furnishing:   { type: String, default: "Unfurnished" },
  floor: String, floorLevel: String, age: String, facing: String,
  carparking: String, bikeparking: String, toilet: String,
  amenities: [String], images: [String], desc: String, color: String, icon: String,
  deposit:    { type: Number, default: null },
  latitude:   { type: Number, default: null },
  longitude:  { type: Number, default: null },
  pgGender:    { type: String, default: null },
  pgRoomType:  { type: String, default: null },
  pgMeals:     { type: String, default: null },
  pgOccupancy: { type: String, default: null },
  pgNotice:    { type: String, default: null },
  pgBathroom:  { type: String, default: null },
  // ── Owner Details ──
  ownerName:   { type: String, default: "" },
  ownerNumber: { type: String, default: "" },
  fullAddress: { type: String, default: "" },
  remarks: [
  {
    remark: { type: String, default: "" },
    date: { type: Date, default: Date.now }
  }
],
  createdAt:   { type: Date, default: Date.now },
  promoted: { type: Boolean, default: false },
  promotedPos: { type: String, default: 'top-right' },
  promotedPriority: { type: Number, default: 3 },
  views: { type: Number, default: 0 }
});
const Property = mongoose.model("Property", PropertySchema);

const ReviewSchema = new mongoose.Schema({
  name: String, role: String, comment: String,
  email: { type: String, default: "" },
  rating: { type: Number, min:1, max:5, required:true },
  createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model("Review", ReviewSchema);

// ── RAZORPAY ──
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ── PAYMENT SCHEMA ──
const PaymentSchema = new mongoose.Schema({
  orderId:        { type: String, required: true, unique: true },
  paymentId:      { type: String, default: "" },
  signature:      { type: String, default: "" },
  type:           { type: String, enum: ["listing","token","membership","consultation"], required: true },
  amount:         { type: Number, required: true },   // in paise
  currency:       { type: String, default: "INR" },
  status:         { type: String, enum: ["created","paid","failed"], default: "created" },
  name:           { type: String, default: "" },
  email:          { type: String, default: "" },
  mobile:         { type: String, default: "" },
  propertyId:     { type: String, default: "" },
  propertyTitle:  { type: String, default: "" },
  plan:           { type: String, default: "" },
  notes:          { type: String, default: "" },
  createdAt:      { type: Date, default: Date.now }
});
const Payment = mongoose.model("Payment", PaymentSchema);
const SiteVisitSchema = new mongoose.Schema({
  date:    { type: String, required: true, unique: true }, // YYYY-MM-DD
  count:   { type: Number, default: 0 },
  total:   { type: Number, default: 0 }
});
const SiteVisit = mongoose.model("SiteVisit", SiteVisitSchema);

// ── OTP STORE (in-memory) ──
const otpStore = {};
// Clean up expired OTPs every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  Object.keys(otpStore).forEach(email => {
    if (otpStore[email].expiresAt < now) delete otpStore[email];
  });
}, 10 * 60 * 1000);

// ── EMAIL ──
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = "karthik.j@enhancesys.com";
const BREVO_SENDER_NAME = "KR Real Estate";

async function sendEmailWithBrevo(to, subject, htmlContent) {
  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
        to: [{ email: to, name: to.split('@')[0] }],
        subject: subject,
        htmlContent: htmlContent
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY
        }
      }
    );
    return { success: true, data: response.data };
  } catch (error) {
    console.error("Brevo email error:", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

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
  if (!email) return res.status(400).json({ success:false, message:"Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, expiresAt: Date.now() + 5*60*1000 };

  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0">
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
  </div>`;

  const result = await sendEmailWithBrevo(email, "Your OTP — KR Real Estate", emailHtml);
  if (result.success) {
    res.json({ success: true });
  } else {
    console.error("Brevo send error:", result.error);
    res.json({ success: false, message: "Failed to send email. Please try again later." });
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
    const user = await new User({
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      email:     email.trim().toLowerCase(),
      mobile:    mobile.trim(),
      password:  hashed,
      role:      "user"
    }).save();
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
    const ADMIN_KEY = process.env.ADMIN_API_KEY;
    if (emailLower === "admin" && password === "admin") {
      return res.json({ firstName:"Admin", lastName:"", isAdmin:true, role:"admin", adminKey: ADMIN_KEY });
    }
    const user = await User.findOne({ email: emailLower });
    if (!user) return res.status(401).json({ message:"No account found with this email. Please register first." });
    if (!user.password) return res.status(401).json({ message:"Password not set. Please register again." });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message:"Incorrect password. Please try again." });
    const isAdminUser = user.role === "admin";
    res.json({ firstName:user.firstName, lastName:user.lastName||"", isAdmin:isAdminUser, role:user.role, ...(isAdminUser ? { adminKey: ADMIN_KEY } : {}) });
  } catch(err) {
    console.error("Login error:", err);
    res.status(500).json({ message:"Server error." });
  }
});

// USERS
app.get("/api/users", adminAuth, async (req, res) => {
  try { res.json(await User.find({},"-password").sort({createdAt:-1})); }
  catch(err) { res.status(500).json([]); }
});
app.delete("/api/users/mobile/:mobile", adminAuth, async (req, res) => {
  try {
    const deleted = await User.findOneAndDelete({ mobile: req.params.mobile });
    if (!deleted) return res.status(404).json({ message:"User not found" });
    res.json({ message:"Deleted successfully" });
  } catch(err) { res.status(500).json({ message:"Server error" }); }
});

// PROPERTIES
// Fields that are admin-only and must never be sent to regular users
const ADMIN_ONLY_FIELDS = ['ownerName','ownerNumber','fullAddress','latitude','longitude','remarks'];

// Admin auth middleware - all admin routes require x-admin-key header
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ success: false, message: 'Forbidden: admin access required.' });
  }
  next();
}

app.get("/api/properties", async (req, res) => {
  try {
    const isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_API_KEY;
    const props = await Property.find().sort({ createdAt: -1 }).lean();
    if (isAdmin) return res.json(props);
    // Strip sensitive fields for non-admin callers
    const safe = props.map(p => {
      const clone = { ...p };
      ADMIN_ONLY_FIELDS.forEach(f => delete clone[f]);
      return clone;
    });
    res.json(safe);
  } catch(err) { res.status(500).json([]); }
});

app.post("/api/properties", adminAuth, async (req, res) => {
  try {
    const prop = new Property(req.body);
    await prop.save();
    res.json({ message:"Property added successfully!" });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message:"Error saving property: " + err.message });
  }
});

app.put("/api/properties/:id", adminAuth, async (req, res) => {
  try {
    const updated = await Property.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: "Property not found" });
    // Recalculate displayPrice if price or status changed
    if (req.body.fullAddress !== undefined) updated.fullAddress = req.body.fullAddress || "";
    if (req.body.price || req.body.status) {
      const num = updated.price;
      let display = '';
      if (num >= 10000000)    display = '₹' + (num/10000000).toFixed(2).replace(/\.?0+$/,'') + ' Cr';
      else if (num >= 100000) display = '₹' + (num/100000).toFixed(1).replace(/\.?0+$/,'') + ' L';
      else                    display = '₹' + num.toLocaleString('en-IN');
      if (['For Rent','Lease','PG'].includes(updated.status)) display += '/Month';
      updated.displayPrice = display;
      await updated.save();
    }
    res.json({ message: "Property updated successfully!", property: updated });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message: "Error updating property: " + err.message });
  }
});

app.delete("/api/properties/:id", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid property ID" });
    const deleted = await Property.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Property not found" });
    res.json({ message: "Property deleted successfully" });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting property: " + err.message });
  }
});

// REVIEWS
app.get("/api/reviews", async (req, res) => {
  try { res.json(await Review.find().sort({createdAt:-1})); }
  catch(err) { res.status(500).json([]); }
});
app.post("/api/reviews", async (req, res) => {
  try {
    const { name, role, comment, rating, email } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message:"Rating must be 1–5" });
    if (!comment || !comment.trim()) return res.status(400).json({ message:"Review comment required" });
    if (email && email.trim()) {
      const existing = await Review.findOne({ email: email.trim().toLowerCase() });
      if (existing) return res.status(400).json({ message:"You have already submitted a review." });
    }
    await new Review({ name, role, comment, rating, email: email ? email.trim().toLowerCase() : "" }).save();
    res.json({ message:"Review submitted successfully!" });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message:"Error saving review" });
  }
});

app.get("/api/reviews/check/:email", async (req, res) => {
  try {
    const existing = await Review.findOne({ email: decodeURIComponent(req.params.email).toLowerCase() });
    res.json({ hasReviewed: !!existing });
  } catch(err) {
    res.status(500).json({ hasReviewed: false });
  }
});

app.delete("/api/reviews/:id", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid review ID" });
    const deleted = await Review.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Review not found" });
    res.json({ message: "Review deleted successfully" });
  } catch(err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting review: " + err.message });
  }
});


// ── After the users DELETE route ──
app.patch("/api/users/mobile/:mobile/remarks", adminAuth, async (req, res) => {
  try {

    const remarkText = (req.body.remarks || "").trim();

    const user = await User.findOne({
      mobile: req.params.mobile
    });

    if (!user)
      return res.status(404).json({
        message: "User not found"
      });

    if (!Array.isArray(user.remarks)) {
      user.remarks = [];
    }

    user.remarks.push({
      remark: remarkText,
      date: new Date()
    });

    await user.save();

    res.json({
      message: "Remarks updated",
      remarks: user.remarks
    });

  } catch(err) {
    console.error(err);
    res.status(500).json({
      message: "Server error"
    });
  }
});

// ── After the properties DELETE route ──
app.patch("/api/properties/:id/remarks", adminAuth, async (req, res) => {
  try {

    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({
        message: "Invalid property ID"
      });

    const remarkText = (req.body.remarks || "").trim();

    const property = await Property.findById(req.params.id);

    if (!property)
      return res.status(404).json({
        message: "Property not found"
      });

    if (!Array.isArray(property.remarks)) {
      property.remarks = [];
    }

    property.remarks.push({
      remark: remarkText,
      date: new Date()
    });

    await property.save();

    res.json({
      message: "Remarks updated",
      remarks: property.remarks
    });

  } catch(err) {
    console.error(err);
    res.status(500).json({
      message: "Server error"
    });
  }
});


// ── Increment property view count ──
const viewedProps = new Map(); // "ip_propertyId" -> date string
const visitedIps = new Map();  // ip -> date string

app.patch("/api/properties/:id/view", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid property ID" });

    const today = new Date().toISOString().split('T')[0];
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const key = `${ip}_${req.params.id}_${today}`;

    // Already viewed this property today from this IP
    if (viewedProps.get(key) === today) {
      const property = await Property.findById(req.params.id);
      return res.json({ views: property.views, skipped: true });
    }

    viewedProps.set(key, today);

    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json({ views: property.views });
  } catch(err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── Site visit tracker ──
app.post("/api/site-visit", async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (visitedIps.get(ip) === today) {
      return res.json({ success: true, skipped: true });
    }
    visitedIps.set(ip, today);
    const visit = await SiteVisit.findOneAndUpdate(
      { date: today },
      { $inc: { count: 1, total: 1 } },
      { upsert: true, new: true }
    );
    res.json({ success: true, today: visit.count });
  } catch(err) { res.status(500).json({ success: false }); }
});

app.get("/api/site-visits", adminAuth, async (req, res) => {
  try {
    const visits = await SiteVisit.find().sort({ date: -1 }).limit(30);
    const total = visits.reduce((sum, v) => sum + v.count, 0);
    res.json({ visits, total });
  } catch(err) { res.status(500).json({ visits: [], total: 0 }); }
});

// Reset all site visits (admin only)
app.delete("/api/site-visits/reset", adminAuth, async (req, res) => {
  try {
    await SiteVisit.deleteMany({});
    visitedIps.clear();
    res.json({ success: true });
  } catch(err) { 
    console.error('Reset site visits error:', err);
    res.status(500).json({ success: false, message: err.message }); 
  }
});

// Reset all property views (admin only)
app.delete("/api/properties/views/reset", adminAuth, async (req, res) => {
  try {
    await Property.updateMany({}, { $set: { views: 0 } });
    viewedProps.clear();
    res.json({ success: true });
  } catch(err) { 
    console.error('Reset property views error:', err);
    res.status(500).json({ success: false, message: err.message }); 
  }
});

// ── Toggle promoted status ──
app.patch("/api/properties/:id/promote", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid property ID" });
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });
    property.promoted = !property.promoted;
    if (property.promoted) {
      const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      const pos = req.body && req.body.promotedPos;
      const priority = req.body && req.body.promotedPriority;
      property.promotedPos = validPositions.includes(pos) ? pos : 'top-right';
      property.promotedPriority = [1,2,3].includes(Number(priority)) ? Number(priority) : 3;
    } else {
      property.promotedPos = 'top-right';
      property.promotedPriority = 3;
    }
    await property.save();
    res.json({ message: "Promoted status updated", promoted: property.promoted, promotedPos: property.promotedPos, promotedPriority: property.promotedPriority });
  } catch(err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ══════════════════════════════════════════════
// PAYMENT ROUTES (Razorpay)
// ══════════════════════════════════════════════

// Payment type config
const PAYMENT_CONFIG = {
  listing:      { label: "Property Listing Fee",      amount: 49900  },  // ₹499
  token:        { label: "Token Booking Amount",       amount: 500000 },  // ₹5,000
  membership:   { label: "Premium Membership",         amount: 199900 },  // ₹1,999
  consultation: { label: "Service / Consultation Fee", amount: 99900  }   // ₹999
};

// CREATE ORDER
app.post("/api/payment/create-order", async (req, res) => {
  try {
    const { type, name, email, mobile, propertyId, propertyTitle, plan, notes, customAmount } = req.body;
    if (!type || !PAYMENT_CONFIG[type]) return res.status(400).json({ message: "Invalid payment type." });
    if (!name || !email) return res.status(400).json({ message: "Name and email are required." });

    // For token bookings, allow a custom amount (min ₹1,000)
    let amount = PAYMENT_CONFIG[type].amount;
    if (type === "token" && customAmount) {
      const parsed = parseInt(customAmount) * 100;
      if (parsed < 100000) return res.status(400).json({ message: "Minimum token amount is ₹1,000." });
      amount = parsed;
    }

    const options = {
      amount,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: { name, email, mobile: mobile || "", type, propertyTitle: propertyTitle || "" }
    };

    const order = await razorpay.orders.create(options);

    await new Payment({
      orderId: order.id, type, amount, name, email,
      mobile: mobile || "", propertyId: propertyId || "",
      propertyTitle: propertyTitle || "", plan: plan || "",
      notes: notes || "", status: "created"
    }).save();

    res.json({
      success: true,
      orderId: order.id,
      amount:  order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      name, email, mobile: mobile || "",
      description: PAYMENT_CONFIG[type].label
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Could not create payment order. Please try again." });
  }
});

// VERIFY PAYMENT
app.post("/api/payment/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ success: false, message: "Missing payment details." });

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = hmac.digest("hex");

    if (digest !== razorpay_signature)
      return res.status(400).json({ success: false, message: "Payment verification failed." });

    await Payment.findOneAndUpdate(
      { orderId: razorpay_order_id },
      { paymentId: razorpay_payment_id, signature: razorpay_signature, status: "paid" }
    );

    res.json({ success: true, message: "Payment verified successfully!" });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ success: false, message: "Verification error." });
  }
});

// MARK FAILED
app.post("/api/payment/failed", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (orderId) await Payment.findOneAndUpdate({ orderId }, { status: "failed" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// LIST PAYMENTS (admin)
app.get("/api/payments", adminAuth, async (req, res) => {
  try { res.json(await Payment.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json([]); }
});

// DELETE PAYMENT (admin)
app.delete("/api/payments/:id", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid payment ID" });
    const deleted = await Payment.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Payment not found" });
    res.json({ message: "Payment deleted successfully" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// ── Quick Status Change ──
app.patch("/api/properties/:id/status", adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["For Sale","For Rent","New Launch","Sold","Lease","PG"];
    if (!validStatuses.includes(status))
      return res.status(400).json({ message: "Invalid status" });
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid property ID" });
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json({ message: "Status updated", status: property.status });
  } catch(err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── Reset single property views ──
app.delete("/api/properties/:id/views/reset", adminAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ message: "Invalid property ID" });
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { $set: { views: 0 } },
      { new: true }
    );
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json({ success: true, views: 0 });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// FRONTEND
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));