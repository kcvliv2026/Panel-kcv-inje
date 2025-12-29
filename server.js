const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "KCV_SECRET_KEY_2025";
let maintenanceMode = false;
let panelPoints = 99989;

// ==== USERS - WALANG ACCESS KEY! ====
const users = [
  {
    id: 1,
    username: "kcv_admin",
    password: bcrypt.hashSync("kcv_panel_2025", 10),
    role: "admin"
  },
  {
    id: 2,
    username: "test_mod",
    password: bcrypt.hashSync("mod_123", 10),
    role: "moderator"
  },
  {
    id: 3,
    username: "reseller_01",
    password: bcrypt.hashSync("reseller_123", 10),
    role: "reseller",
    resellerPoints: 500,
    resellerKeys: []
  }
];

// ==== KEY LISTS - WALANG PRE-SET KEYS! ====
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
// 1. LOGIN - USERNAME AT PASSWORD LANG!
app.post("/api/login", (req, res) => {
  if (maintenanceMode && req.body.username !== "kcv_admin") {
    return res.status(503).json({ success: false, message: "Panel under maintenance!" });
  }

  const { username, password } = req.body;
  const user = users.find(u => u.username === username);

  if (!user) return res.status(401).json({ success: false, message: "Invalid username!" });
  const validPass = bcrypt.compareSync(password, user.password);

  if (!validPass) {
    return res.status(401).json({ success: false, message: "Wrong password!" });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ 
    success: true, 
    token, 
    username: user.username, 
    role: user.role,
    points: user.role === "reseller" ? user.resellerPoints : panelPoints
  });
});

// 2. GET PANEL DATA
app.get("/api/panel-data", (req, res) => {
  const auth = checkRole(req, ["admin", "moderator", "reseller"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "No permission!" });

  let keysToShow = [];
  if (auth.user.role === "admin" || auth.user.role === "moderator") {
    keysToShow = globalKeys;
  } else {
    keysToShow = auth.user.resellerKeys;
  }

  res.json({
    success: true,
    points: auth.user.role === "reseller" ? auth.user.resellerPoints : panelPoints,
    maintenanceMode: maintenanceMode,
    keys: keysToShow,
    role: auth.user.role
  });
});

// 3. TOGGLE MAINTENANCE MODE
app.post("/api/toggle-maintenance", (req, res) => {
  const auth = checkRole(req, ["admin"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "Only Admin!" });

  maintenanceMode = !maintenanceMode;
  res.json({ 
    success: true, 
    maintenanceMode,
    message: maintenanceMode ? "✅ Maintenance ON!" : "❌ Maintenance OFF!" 
  });
});

// 4. GENERATE KEY
app.post("/api/generate-key", (req, res) => {
  const auth = checkRole(req, ["admin", "moderator", "reseller"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "No permission!" });

  const { keyType, duration, deviceSlot } = req.body;
  let cost = 0;
  let newKey = "";
  let updatedPoints = 0;

  if (keyType === "VIP") {
    cost = duration === "1 Day" ? 6 : duration === "7 Days" ? 30 : 100;
  } else {
    cost = duration === "1 Day" ? 3 : duration === "2 Days" ? 5 : 3;
  }

  if (auth.user.role === "reseller") {
    if (auth.user.resellerPoints < cost) {
      return res.status(400).json({ success: false, message: "Insufficient points!" });
    }
    const newId = auth.user.resellerKeys.length + 1;
    newKey = `KCV-RES-${keyType}-${duration.replace(/\s/g, "")}-${Math.floor(Math.random() * 9999)}`;
    auth.user.resellerKeys.push({
      id: newId,
      key: newKey,
      status: "active",
      type: keyType,
      expiry: duration,
      user: "0/0",
      devices: deviceSlot
    });
    auth.user.resellerPoints -= cost;
    updatedPoints = auth.user.resellerPoints;
  } else {
    if (panelPoints < cost) {
      return res.status(400).json({ success: false, message: "Insufficient points!" });
    }
    const newId = globalKeys.length + 1;
    newKey = `KCV-GLB-${keyType}-${duration.replace(/\s/g, "")}-${Math.floor(Math.random() * 9999)}`;
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
    updatedPoints = panelPoints;
  }

  res.json({ success: true, newKey, updatedPoints });
});

// 5. CREATE RESELLER
app.post("/api/create-reseller", (req, res) => {
  const auth = checkRole(req, ["admin"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "Only Admin!" });

  const { username, password, initialPoints } = req.body;
  const newId = users.length + 1;

  users.push({
    id: newId,
    username: username,
    password: bcrypt.hashSync(password, 10),
    role: "reseller",
    resellerPoints: initialPoints || 100,
    resellerKeys: []
  });

  res.json({ success: true, message: "✅ Reseller created!" });
});

// 6. DELETE KEY
app.post("/api/delete-key", (req, res) => {
  const auth = checkRole(req, ["admin"]);
  if (!auth.allowed) return res.status(403).json({ success: false, message: "Only Admin!" });

  const { keyId } = req.body;
  const keyIndex = globalKeys.findIndex(k => k.id === parseInt(keyId));
  
  if (keyIndex === -1) {
    return res.status(404).json({ success: false, message: "Key not found!" });
  }

  globalKeys.splice(keyIndex, 1);
  res.json({ success: true, message: "❌ Key deleted!" });
});

// 7. SERVE FRONTEND
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));

app.listen(PORT, () => console.log("✅ KCV VIP PANEL ONLINE!"));
