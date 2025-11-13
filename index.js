const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Atlas URI

const uri = `mongodb+srv://${process.env.CS_USER}:${process.env.CS_PASS}@mydb81.7dbidnl.mongodb.net/?appName=MyDB81`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Course-Nest Server Is Running");
});

// Run Function Start Here
async function run() {
  try {
    await client.connect();
    const db = client.db("course_nest_db");

    // Collections
    const coursesCollection = db.collection("courses");
    const usersCollection = db.collection("users");
    const enrollmentsCollection = db.collection("enrollments");
    const progressCollection = db.collection("progress");

    // GET all courses
    app.get("/courses", async (req, res) => {
      try {
        const category = req.query.category;
        const owner = req.query.owner;

        let query = {};
        if (category) {
          query.category = { $regex: new RegExp(`^${category}$`, "i") };
        }
        if (owner) {
          query.owner = owner;
        }

        const courses = await coursesCollection.find(query).toArray();
        const formatted = courses.map((c) => ({
          ...c,
          _id: c._id.toString(),
        }));

        res.send(formatted);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch courses" });
      }
    });

    // single course With id
    app.get("/courses/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const course = await coursesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (course) course._id = course._id.toString();
        res.send(course);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch course details" });
      }
    });

    //  POST new course

    app.post("/courses", async (req, res) => {
      try {
        const newCourse = req.body;
        const result = await coursesCollection.insertOne(newCourse);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to add course" });
      }
    });

    //  PATCH update course
    app.patch("/courses/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const result = await coursesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send(result);
      } catch (error) {
        console.error("Update error:", error);
        res.status(500).send({ message: "Failed to update course" });
      }
    });

    //  DELETE course

    app.delete("/courses/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await coursesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to delete course" });
      }
    });

    // POST enrollment
    app.post("/enrollments", async (req, res) => {
      try {
        const enrollment = req.body;

        const existing = await enrollmentsCollection.findOne({
          courseId: enrollment.courseId,
          studentEmail: enrollment.studentEmail,
        });

        if (existing) {
          return res
            .status(400)
            .send({ message: "Already enrolled in this course" });
        }

        const course = await coursesCollection.findOne({
          _id: new ObjectId(enrollment.courseId),
        });

        if (!course) {
          return res.status(404).send({ message: "Course not found" });
        }

        // Merge course details into enrollment
        const enrichedEnrollment = {
          ...enrollment,
          courseTitle: course.title,
          courseImage: course.imageUrl,
          courseCategory: course.category,
          courseDuration: course.duration,
          coursePrice: course.price,
          description: course.description,
        };

        const result = await enrollmentsCollection.insertOne(
          enrichedEnrollment
        );

        // Insert progress record
        await progressCollection.updateOne(
          {
            studentEmail: enrollment.studentEmail,
            courseId: enrollment.courseId,
          },
          {
            $setOnInsert: {
              studentEmail: enrollment.studentEmail,
              courseId: enrollment.courseId,
              courseTitle: course.title,
              completedModules: 0,
              totalModules: course.totalModules || 0,
              scores: [],
              lastActive: new Date(),
            },
          },
          { upsert: true }
        );

        res.send(result);
      } catch (error) {
        console.error("Enrollment error:", error);
        res.status(500).send({ message: "Failed to enroll" });
      }
    });

    /// enrollments for a student
    app.get("/enrollments", async (req, res) => {
      try {
        const studentEmail = req.query.studentEmail;
        const query = studentEmail ? { studentEmail } : {};
        const enrollments = await enrollmentsCollection.find(query).toArray();
        const formatted = enrollments.map((e) => ({
          ...e,
          _id: e._id.toString(),
        }));
        res.send(formatted);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch enrollments" });
      }
    });

    //  DELETE enrollment
    app.delete("/enrollments/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await enrollmentsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to unenroll" });
      }
    });

    // Reviews Collection
    const reviewsCollection = db.collection("reviews");

    // POST a new review
    app.post("/reviews", async (req, res) => {
      try {
        const review = req.body; // { courseId, studentEmail, rating, comment }
        review.createdAt = new Date();

        const result = await reviewsCollection.insertOne(review);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to add review" });
      }
    });

    // GET all reviews for a course
    app.get("/reviews/:courseId", async (req, res) => {
      try {
        const courseId = req.params.courseId;
        const reviews = await reviewsCollection.find({ courseId }).toArray();
        res.send(reviews);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch reviews" });
      }
    });

    // GET average rating
    app.get("/courses/:id/average-rating", async (req, res) => {
      try {
        const courseId = req.params.id;
        const avg = await reviewsCollection
          .aggregate([
            { $match: { courseId } },
            { $group: { _id: null, average: { $avg: "$rating" } } },
          ])
          .toArray();

        res.send({ average: avg[0]?.average || 0 });
      } catch (error) {
        res.status(500).send({ message: "Failed to calculate average rating" });
      }
    });

    // Review delete and edit

    app.patch("/reviews/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { rating, comment, studentEmail } = req.body;

        const review = await reviewsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!review)
          return res.status(404).send({ message: "Review not found" });
        if (review.studentEmail !== studentEmail) {
          return res
            .status(403)
            .send({ message: "Not authorized to edit this review" });
        }

        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { rating, comment, updatedAt: new Date() } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update review" });
      }
    });

    // DELETE a review
    app.delete("/reviews/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { studentEmail, isAdmin } = req.body;

        const review = await reviewsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!review)
          return res.status(404).send({ message: "Review not found" });

        if (review.studentEmail !== studentEmail && !isAdmin) {
          return res
            .status(403)
            .send({ message: "Not authorized to delete this review" });
        }

        const result = await reviewsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to delete review" });
      }
    });

    // MongoDB ping checking
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. Connected to MongoDB!");
  } finally {
  }
}

run().catch(console.dir);

// Start server code
app.listen(port, () => {
  console.log(`Course-Nest server is running on port: ${port}`);
});
