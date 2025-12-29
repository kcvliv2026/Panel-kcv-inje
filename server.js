const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "KCV_SECRET_KEY_2025";
let maintenanceMode = false;
let panelPoints = 99989; // Default points (tulad ng larawan)

// ==== USERS WITH ROLES ====
const users = [
  {
    id: 1,
    username: "e",
    password: bcrypt.hashSync("kcv_panel_2025", 10),
    accessKey: "e",
    role: "admin"
  },
  {
    id: 2,
    username: "test_mod",
    password: bcrypt.hashSync("mod_123", 10),
    accessKey: "KCV_MOD_ACCESS_456",
    role: "moderator"
  }
];

// ==== RESELLERS LIST ====
const resellers = [
  { id: 1, username: "reseller_01", points: 500, status: "active" }
];

// ==== GENERATED KEYS LIST ====
const generatedKeys = [
  {
    id: 1,
    key: "KCV-FREE-2DAYS-91XX",
    status: "active",
    type: "Free",
    expiry: "2 Days",
    user: "9/1",
    devices: 1
  },
  {
    id: 2,
    key: "KCV-VIP-LIFETIME-123",
    status: "active",
    type: "VIP",
    expiry: "Lifetime",
    user: "1/23",
    devices: 1
  },
  {
    id: 3,
    key: "KCV-VIP-LIFETIME-456",
    status: "active",
    type: "VIP",
    expiry: "Lifetime",
    user: "1/1",
    devices: 1
  }
];

// Basic Setup
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, ".")));

// ==== HELPER FUNCTION: CHECK ROLE ====
function checkRole(req, allowedRoles) {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find(u => u.id === decoded.userId);
    return allowedRoles.includes(user.role);
  } catch (err) {
    return false;
  }
}

// ==== API ROUTES ====
// 1. Login Route
app.post("/api/login", (req, res) => {
  if (maintenanceMode) {
    return res.status(503).json({ success: false, message: "Panel under maintenance!" });
  }

  const { username, accessKey, password } = req.body;
  const user = users.find(u => u.username === username);

  if (!user) return res.status(401).json({ success: false, message: "Invalid username!" });
  const validPass = bcrypt.compareSync(password, user.password);
  const validKey = user.accessKey === accessKey;

  if (!validPass || !validKey) {
    return res.status(401).json({ success: false, message: "Wrong password/access key!" });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ 
    success: true, 
    token, 
    username: user.username, 
    role: user.role,
    points: panelPoints 
  });
});

// 2. Get Panel Data (Keys, Points, Maintenance Status)
app.get("/api/panel-data", (req, res) => {
  if (!checkRole(req, ["admin", "moderator"])) {
    return res.status(403).json({ success: false, message: "No permission!" });
  }

  res.json({
    success: true,
    points: panelPoints,
    maintenanceMode: maintenanceMode,
    generatedKeys: generatedKeys,
    resellers: resellers
  });
});

// 3. Toggle Maintenance Mode
app.post("/api/toggle-maintenance", (req, res) => {
  if (!checkRole(req, ["admin"])) {
    return res.status(403).json({ success: false, message: "Only Admin!" });
  }

  maintenanceMode = !maintenanceMode;
  res.json({ 
    success: true, 
    maintenanceMode,
    message: maintenanceMode ? "Maintenance ON!" : "Maintenance OFF!" 
  });
});

// 4. Generate New Key
app.post("/api/generate-key", (req, res) => {
  if (!checkRole(req, ["admin", "moderator"])) {
    return res.status(403).json({ success: false, message: "No permission!" });
  }

  const { type, duration, devices } = req.body;
  const newId = generatedKeys.length + 1;
  const newKey = `KCV-${type}-${duration.replace(/\s/g, "")}-${Math.floor(Math.random() * 1000)}`;

  generatedKeys.push({
    id: newId,
    key: newKey,
    status: "active",
    type: type,
    expiry: duration,
    user: "0/0",
    devices: devices
  });

  // Bawasan points (kung kailangan)
  if (type === "VIP") panelPoints -= 6; // Tulad ng "1 Day (6 points)" sa larawan
  else panelPoints -= 3;

  res.json({ success: true, newKey, updatedPoints: panelPoints });
});

// 5. Create Reseller
app.post("/api/create-reseller", (req, res) => {
  if (!checkRole(req, ["admin"])) {
    return res.status(403).json({ success: false, message: "Only Admin!" });
  }

  const { username, points } = req.body;
  const newId = resellers.length + 1;

  resellers.push({
    id: newId,
    username: username,
    points: points,
    status: "active"
  });

  res.json({ success: true, message: "Reseller created!" });
});

// 6. Serve Frontend
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));

// Run Server
app.listen(PORT, () => console.log("✅ KCV VIP PANEL ONLINE!"));
