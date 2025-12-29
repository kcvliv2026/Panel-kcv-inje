const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "KCV_SECRET_KEY_2025"; // PALITAN MO ITO NG SARILI MONG SECRET KEY!
let maintenanceMode = false;

// Basic Setup
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, ".")));

// ==== USERS WITH ROLES ====
const users = [
  {
    id: 1,
    username: "kcv_admin",
    password: bcrypt.hashSync("kcv_panel_2025", 10),
    accessKey: "KCV_DEMO_ACCESS_123",
    role: "admin"
  },
  {
    id: 2,
    username: "test_mod",
    password: bcrypt.hashSync("mod_123", 10),
    accessKey: "KCV_MOD_ACCESS_456",
    role: "moderator"
  },
  {
    id: 3,
    username: "test_user",
    password: bcrypt.hashSync("user_123", 10),
    accessKey: "KCV_USER_ACCESS_789",
    role: "user"
  }
];

// ==== INJECTOR SETTINGS ====
let injectorSettings = {
  autoInject: false,
  injectDelay: 5000,
  enableLogs: true
};

// ==== HELPER FUNCTION: CHECK USER ROLE ====
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

  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid username!" });
  }

  const isPasswordValid = bcrypt.compareSync(password, user.password);
  const isAccessKeyValid = user.accessKey === accessKey;

  if (!isPasswordValid || !isAccessKeyValid) {
    return res.status(401).json({ success: false, message: "Wrong password or access key!" });
  }

  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ success: true, token, username: user.username, role: user.role });
});

// 2. Get Injector Settings
app.get("/api/settings", (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find(u => u.id === decoded.userId);
    
    res.json({ 
      success: true, 
      settings: injectorSettings,
      role: user.role 
    });
  } catch (err) {
    res.status(401).json({ success: false, message: "Unauthorized!" });
  }
});

// 3. Update Settings (Admin/Moderator Only)
app.post("/api/update-settings", (req, res) => {
  if (!checkRole(req, ["admin", "moderator"])) {
    return res.status(403).json({ success: false, message: "No permission to edit settings!" });
  }

  try {
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, JWT_SECRET);
    
    const newSettings = req.body;
    injectorSettings = { ...injectorSettings, ...newSettings };
    res.json({ success: true, message: "Settings updated!", settings: injectorSettings });
  } catch (err) {
    res.status(401).json({ success: false, message: "Unauthorized!" });
  }
});

// 4. Toggle Maintenance Mode (Admin Only)
app.post("/api/toggle-maintenance", (req, res) => {
  if (!checkRole(req, ["admin"])) {
    return res.status(403).json({ success: false, message: "Only Admin can access this!" });
  }

  maintenanceMode = !maintenanceMode;
  res.json({ 
    success: true, 
    maintenanceMode: maintenanceMode, 
    message: maintenanceMode ? "✅ Maintenance Mode ON!" : "❌ Maintenance Mode OFF!" 
  });
});

// 5. View All Users (Admin Only)
app.get("/api/users", (req, res) => {
  if (!checkRole(req, ["admin"])) {
    return res.status(403).json({ success: false, message: "Only Admin can access this!" });
  }

  const safeUsers = users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    accessKey: u.accessKey
  }));
  res.json({ success: true, users: safeUsers });
});

// ==== SERVE FRONTEND FILES ====
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));

// ==== RUN SERVER ====
app.listen(PORT, () => console.log("✅ KCV PANEL SERVER ONLINE!"));
