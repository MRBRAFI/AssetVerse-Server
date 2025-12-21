require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;
// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
//   "utf-8"
// );
// const serviceAccount = JSON.parse(decoded);
const serviceAccount = require("./assetverse-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://b12-m11-session.web.app",
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // console.log("AUTH HEADER:", authHeader);

    if (!authHeader) {
      return res.status(401).send({ message: "Unauthorized Access" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = await admin.auth().verifyIdToken(token);

    req.email = decoded.email;
    req.uid = decoded.uid;
    req.name = decoded.name;
    req.picture = decoded.picture;

    next();
  } catch (error) {
    console.error("JWT Error:", error.message);
    return res.status(401).send({ message: "Unauthorized Access" });
  }
};

const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@mrb.saeddyn.mongodb.net/?appName=MRB`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("AssetVerse");
    const usersCollection = db.collection("users");
    const packageCollection = db.collection("packages");
    const assetsCollection = db.collection("assets");
    const requestsCollection = db.collection("requests");
    const employeeAffiliationsCollection = db.collection("affiliation");
    const assignedAssetsCollections = db.collection("assignedAssets");

    // Approval and Assignment related APIs

    app.patch("/requests/:id/action", verifyJWT, async (req, res) => {
      try {
        const requestId = req.params.id;
        const { action } = req.body;

        /* ---------------- VALIDATION ---------------- */

        if (!["approve", "reject"].includes(action)) {
          return res.status(400).json({ message: "Invalid action" });
        }

        const request = await requestsCollection.findOne({
          _id: new ObjectId(requestId),
        });

        if (!request) {
          return res.status(404).json({ message: "Request not found" });
        }

        // Only owning HR can process
        if (request.hrEmail !== req.email) {
          return res
            .status(403)
            .json({ message: "Unauthorized to process this request" });
        }

        /* ---------------- REJECT FLOW ---------------- */

        if (action === "reject") {
          await requestsCollection.updateOne(
            { _id: new ObjectId(requestId) },
            {
              $set: {
                requestStatus: "rejected",
                processedBy: req.email,
                approvalDate: new Date(),
              },
            }
          );

          return res.json({ message: "Request rejected successfully" });
        }

        /* ---------------- APPROVE FLOW ---------------- */

        const hr = await usersCollection.findOne({ email: req.email });

        if (!hr) {
          return res.status(404).json({ message: "HR not found" });
        }

        /* -------- EMPLOYEE AFFILIATION CHECK -------- */

        const existingAffiliation =
          await employeeAffiliationsCollection.findOne({
            employeeEmail: request.requesterEmail,
            hrEmail: hr.email,
          });

        // Only count employee once
        if (!existingAffiliation) {
          const newEmployeeCount = hr.currentEmployees + 1;

          if (newEmployeeCount > hr.packageLimit) {
            return res.status(400).json({
              message: "HR exceeded package limit. Please upgrade package.",
            });
          }

          // Create affiliation
          await employeeAffiliationsCollection.insertOne({
            employeeEmail: request.requesterEmail,
            employeeName: request.requesterName,
            hrEmail: hr.email,
            companyName: hr.companyName,
            companyLogo: hr.companyLogo,
            affiliationDate: new Date(),
            status: "active",
          });

          // Increment employee count
          await usersCollection.updateOne(
            { email: hr.email },
            { $inc: { currentEmployees: 1 } }
          );
        }

        /* ---------------- ASSET CHECK & DEDUCTION ---------------- */

        const asset = await assetsCollection.findOne({
          _id: new ObjectId(request.assetId),
        });

        if (!asset) {
          return res.status(404).json({ message: "Asset not found" });
        }

        if (asset.quantity <= 0) {
          return res.status(400).json({
            message: "Asset is no longer available",
          });
        }

        // Deduct asset quantity
        await assetsCollection.updateOne(
          { _id: asset._id },
          { $inc: { quantity: -1 } }
        );

        /* ---------------- REQUEST STATUS UPDATE ---------------- */

        await requestsCollection.updateOne(
          { _id: new ObjectId(requestId) },
          {
            $set: {
              requestStatus: "approved",
              approvalDate: new Date(),
              processedBy: req.email,
            },
          }
        );

        /* ---------------- ASSIGNED ASSET INSERT (FIXED) ---------------- */

        // ✅ CORRECT collection name (THIS WAS THE BUG)
        await assignedAssetsCollections.insertOne({
          assetId: asset._id,
          assetName: asset.name,
          assetImage: asset.image,
          assetType: asset.type,
          employeeEmail: request.requesterEmail,
          employeeName: request.requesterName,
          hrEmail: hr.email,
          companyName: hr.companyName,
          assignmentDate: new Date(),
          returnDate: null,
          status: "assigned",
        });

        /* ---------------- FINAL RESPONSE ---------------- */

        return res.json({ message: "Request approved successfully" });
      } catch (error) {
        console.error("Approve request error:", error);
        return res.status(500).json({
          message: "Server error",
          error: error.message,
        });
      }
    });

    // Assign Assets to the existing affiliated employee

    app.post("/assign-asset", verifyJWT, async (req, res) => {
      try {
        const { employeeEmail, assetId } = req.body;
        const hrEmail = req.email;

        const affiliation = await employeeAffiliationsCollection.findOne({
          employeeEmail,
          hrEmail,
          status: "active",
        });

        if (!affiliation) {
          return res.status(403).json({
            message: "Employee is not affiliated with your company",
          });
        }

        const asset = await assetsCollection.findOne({
          _id: new ObjectId(assetId),
          hrEmail,
          quantity: { $gt: 0 },
        });

        if (!asset) {
          return res.status(400).json({
            message: "Asset unavailable or not owned by you",
          });
        }

        await assetsCollection.updateOne(
          { _id: asset._id },
          { $inc: { quantity: -1 } }
        );

        await assignedAssetsCollections.insertOne({
          assetId: asset._id,
          assetName: asset.name,
          assetType: asset.type,
          assetImage: asset.image,
          employeeEmail,
          hrEmail,
          companyName: asset.companyName,
          assignmentDate: new Date(),
          returnDate: null,
          status: "assigned",
        });

        res.json({ message: "Asset assigned successfully" });
      } catch (error) {
        console.error("Assign asset error:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Request related api

    app.post("/requests", verifyJWT, async (req, res) => {
      try {
        const { assetId, assetName, assetType, hrEmail, companyName, note } =
          req.body;

        const requestDoc = {
          assetId,
          assetName,
          assetType,
          requesterName: req.name,
          requesterEmail: req.email,
          requesterPhoto: req.picture,
          hrEmail,
          companyName,
          requestDate: new Date(),
          requestStatus: "pending",
          approvalDate: null,
          note: note || "",
          processedBy: null,
        };

        const result = await requestsCollection.insertOne(requestDoc);
        res
          .status(201)
          .send({ message: "Request submitted", requestId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/requests/hr", verifyJWT, async (req, res) => {
      const hrEmail = req.email;

      const result = await requestsCollection
        .find({
          hrEmail,
        })
        .toArray();

      res.send(result);
    });

    // Asset related APIs

    // to get Asset data

    app.get("/assets", async (req, res) => {
      // console.log(req.query);
      const { limit = 0, skip = 0 } = req.query;
      const limitNum = Number(limit);
      const skipNum = Number(skip);

      const result = await assetsCollection
        .find()
        .limit(limitNum)
        .skip(skipNum)
        .toArray();

      const count = await assetsCollection.countDocuments();

      res.send({ result, total: count });
    });

    // to get single Asset data

    app.get("/assets/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await assetsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Post asset data

    app.post("/assets", verifyJWT, async (req, res) => {
      const assetData = req.body;
      console.log(assetData);
      const result = await assetsCollection.insertOne(assetData);
      res.send(result);
    });
    // users related APIs

    // HR registration

    app.post("/users/hr", async (req, res) => {
      const userData = req.body;

      const existingUser = await usersCollection.findOne({
        email: userData.email,
      });

      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    // Employee Registration

    app.post("/users/employee", verifyJWT, async (req, res) => {
      const userData = req.body;

      const existingEmployee = await usersCollection.findOne({
        email: userData.email,
      });

      if (existingEmployee) {
        return res.status(400).json({ message: "You are already an already" });
      }

      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    // to get specific users

    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        // console.log("consoled headers", req.headers);

        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({ role: user.role, ...user });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err });
      }
    });

    // to post packages

    // app.post("/packages", async (req, res) => {
    //   const packages = [
    //     {
    //       name: "Basic",
    //       employeeLimit: 5,
    //       price: 5,
    //       features: ["Asset Tracking", "Employee Management", "Basic Support"],
    //       isActive: true,
    //       createdAt: new Date(),
    //     },
    //     {
    //       name: "Standard",
    //       employeeLimit: 10,
    //       price: 8,
    //       features: [
    //         "All Basic features",
    //         "Advanced Analytics",
    //         "Priority Support",
    //       ],
    //       isActive: true,
    //       createdAt: new Date(),
    //     },
    //     {
    //       name: "Premium",
    //       employeeLimit: 20,
    //       price: 15,
    //       features: [
    //         "All Standard features",
    //         "Custom Branding",
    //         "24/7 Support",
    //       ],
    //       isActive: true,
    //       createdAt: new Date(),
    //     },
    //   ];

    //   const result = await packageCollection.insertMany(packages);
    //   res.send(result);
    // });

    // to get packages

    app.get("/packages", async (req, res) => {
      const packages = await packageCollection
        .find({ isActive: true })
        .toArray();

      res.send(packages);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Server..");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
