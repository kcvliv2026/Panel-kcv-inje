const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "KCV_SECRET_KEY_2025";
let maintenanceMode = false;
let panelPoints = 9999999999999999; // YOUR SALDO!

// ==== USERS ====
const users = [
  {
    id: 1,
    username: "kcv_super", // YOUR USERNAME
    password: bcrypt.hashSync("kcv_super_2025", 10), // YOUR PASSWORD
    role: "super_admin"
  },
  {
    id: 2,
    username: "kcv_admin",
    password: bcrypt.hashSync("kcv_panel_2025", 10),
    role: "admin"
  },
  {
    id: 3,
    username: "test_mod",
    password: bcrypt.hashSync("mod_123", 10),
    role: "moderator"
  }
];

// ==== RESELLERS WITH LOCATION ====
const resellers = [
  {
    id: 1,
    username: "reseller_manila",
    resellerPoints: 50000,
    location: "Manila, Metro Manila, Philippines",
    dateCreated: "2025-12-29"
  },
  {
    id: 2,
    username: "reseller_cebu",
    resellerPoints: 35000,
    location: "Cebu City, Cebu, Philippines",
    dateCreated: "2025-12-28"
  },
  {
    id: 3,
    username: "reseller_davao",
    resellerPoints: 42000,
    location: "Davao City, Davao del Sur, Philippines",
    dateCreated: "2025-12-27"
  }
];

// ==== KEY LISTS ====
const globalKeys = [];

// Basic Setup
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, ".")));

// ==== HELPER: CHECK ROLE ====
function checkRole(req, allowedRoles) {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find(u => u.id === decoded.userId);
    return { allowed: allowedRoles.includes(user.role), user: user };
  } catch (err) {
    return { allowed: false, user: null };
  }
}

// ==== API ROUTES ====
// 1. LOGIN
app.post("/api/login", (req, res) => {
  if (maintenanceMode && req.body.username !== "kcv_super" && req.body.username !== "kcv_admin") {
    return res.status(503).json({ success: false, message: "Panel under maintenance!" });
  }

  const { username, password } = req.body;
  const user = users.find(u => u.username === username);

  if (!user) return res.status(401).json({ success: false, message: "Invalid username!" });
  const validPass = bcrypt.compareSync(password, user.password);

  if (!validPass) {
    return res.status(401).json({ success: false, message: "Wrong password!" });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ 
    success: true, 
    token, 
    username: user.username, 
    role: user.role,
    points: panelPoints
  });
});

// 2. GET PANEL DATA
app.get("/api/panel-data", (req, res) => {
  const auth = checkRole(req, ["super_admin", "admin", "moderator"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "No permission!" });

  res.json({
    success: true,
    points: panelPoints,
    maintenanceMode: maintenanceMode,
    keys: globalKeys,
    role: auth.user.role
  });
});

// 3. GET RESELLER LOCATIONS
app.get("/api/reseller-locations", (req, res) => {
  const auth = checkRole(req, ["super_admin", "admin"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "Only Super Admin/Admin can view!" });

  res.json({
    success: true,
    resellers: resellers
  });
});

// 4. TOGGLE MAINTENANCE
app.post("/api/toggle-maintenance", (req, res) => {
  const auth = checkRole(req, ["super_admin", "admin"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "No permission!" });

  maintenanceMode = !maintenanceMode;
  res.json({ 
    success: true, 
    message: maintenanceMode ? "✅ Maintenance ON!" : "❌ Maintenance OFF!" 
  });
});

// 5. GENERATE KEY (SALDO DEDUCTS)
app.post("/api/generate-key", (req, res) => {
  const auth = checkRole(req, ["super_admin", "admin", "moderator"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "No permission!" });

  const { keyType, duration, deviceSlot } = req.body;
  let cost = 0;

  if (keyType === "VIP") {
    cost = duration === "1 Day" ? 6 : duration === "7 Days" ? 30 : 100;
  } else {
    cost = duration === "1 Day" ? 3 : duration === "2 Days" ? 5 : 3;
  }

  if (panelPoints < cost) {
    return res.status(400).json({ success: false, message: "Insufficient saldo!" });
  }

  const newId = globalKeys.length + 1;
  const newKey = `KCV-GLB-${keyType}-${duration.replace(/\s/g, "")}-${Math.floor(Math.random() * 9999)}`;
  globalKeys.push({
    id: newId,
    key: newKey,
    status: "active",
    type: keyType,
    expiry: duration,
    user: "0/0",
    devices: deviceSlot
  });
  panelPoints -= cost;

  res.json({ success: true, newKey, updatedPoints: panelPoints });
});

// 6. DELETE KEY
app.post("/api/delete-key", (req, res) => {
  const auth = checkRole(req, ["super_admin", "admin"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "No permission!" });

  const { keyId } = req.body;
  const keyIndex = globalKeys.findIndex(k => k.id === parseInt(keyId));
  
  if (keyIndex === -1) {
    return res.status(404).json({ success: false, message: "Key not found!" });
  }

  globalKeys.splice(keyIndex, 1);
  res.json({ success: true, message: "❌ Key deleted!" });
});

// 7. GET KEY LOGS
app.get("/api/key-logs", (req, res) => {
  const auth = checkRole(req, ["super_admin", "admin", "moderator"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "No permission!" });

  res.json({
    success: true,
    totalGenerated: globalKeys.length,
    activeKeys: globalKeys.filter(k => k.status === "active").length,
    vipKeys: globalKeys.filter(k => k.type === "VIP").length,
    freeKeys: globalKeys.filter(k => k.type === "Free").length
  });
});

// 8. CONTROL WEBSITE
app.post("/api/control-website", (req, res) => {
  const auth = checkRole(req, ["super_admin", "admin"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "No permission!" });

  const { action } = req.body;
  res.json({ success: true, message: `✅ Action "${action}" done!` });
});

// 9. SERVE FRONTEND
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
