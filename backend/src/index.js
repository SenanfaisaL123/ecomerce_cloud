import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { Pool } from "pg"
import multer from "multer"
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { v4 as uuidv4 } from "uuid"


dotenv.config()

// Initialize Express app
const app = express()
app.use(cors())
app.use(express.json())

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false,
  },
})

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

// Multer setup for file uploads
const storage = multer.memoryStorage()
const upload = multer({ storage })

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) return res.status(401).json({ error: "Access denied" })

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET)
    req.user = verified
    next()
  } catch (error) {
    res.status(403).json({ error: "Invalid token" })
  }
}

// Initialize database tables
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        image_url VARCHAR(255),
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    console.log("Database tables initialized")
  } catch (error) {
    console.error("Error initializing database:", error)
  }
}

// Initialize database on startup
initDb()

// AUTH ROUTES
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body

    // Check if user already exists
    const userCheck = await pool.query("SELECT * FROM users WHERE email = $1 OR username = $2", [email, username])

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Insert new user
    const newUser = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hashedPassword],
    )

    // Generate JWT token
    const token = jwt.sign({ id: newUser.rows[0].id, username: newUser.rows[0].username }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    })

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser.rows[0].id,
        username: newUser.rows[0].username,
        email: newUser.rows[0].email,
      },
      token,
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Find user
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email])

    if (user.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" })
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.rows[0].password)
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid credentials" })
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.rows[0].id, username: user.rows[0].username }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    })

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        email: user.rows[0].email,
      },
      token,
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// PRODUCT ROUTES
app.post("/api/products", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    const { name, description, price } = req.body
    const userId = req.user.id
    let imageUrl = null

    // Upload image to S3 if provided
    if (req.file) {
      const fileKey = `products/${uuidv4()}-${req.file.originalname}`

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }

      await s3Client.send(new PutObjectCommand(params))
      imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`
    }

    // Insert product into database
    const newProduct = await pool.query(
      "INSERT INTO products (name, description, price, image_url, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, description, price, imageUrl, userId],
    )

    res.status(201).json({
      message: "Product created successfully",
      product: newProduct.rows[0],
    })
  } catch (error) {
    console.error("Create product error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

app.get("/api/products", async (req, res) => {
  try {
    const products = await pool.query("SELECT * FROM products ORDER BY created_at DESC")

    // Generate signed URLs for S3 images
    const productsWithSignedUrls = await Promise.all(
      products.rows.map(async (product) => {
        if (product.image_url) {
          const key = product.image_url.split(".com/")[1]
          const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: key,
          })
          const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
          return { ...product, signed_image_url: signedUrl }
        }
        return product
      }),
    )

    res.status(200).json(productsWithSignedUrls)
  } catch (error) {
    console.error("Get products error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params

    const product = await pool.query("SELECT * FROM products WHERE id = $1", [id])

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Generate signed URL for S3 image
    if (product.rows[0].image_url) {
      const key = product.rows[0].image_url.split(".com/")[1]
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
      })
      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
      product.rows[0].signed_image_url = signedUrl
    }

    res.status(200).json(product.rows[0])
  } catch (error) {
    console.error("Get product error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

app.put("/api/products/:id", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, price } = req.body
    const userId = req.user.id

    // Check if product exists and belongs to user
    const productCheck = await pool.query("SELECT * FROM products WHERE id = $1", [id])

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    if (productCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Not authorized to update this product" })
    }

    let imageUrl = productCheck.rows[0].image_url

    // Upload new image to S3 if provided
    if (req.file) {
      // Delete old image if exists
      if (imageUrl) {
        const oldKey = imageUrl.split(".com/")[1]
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: oldKey,
          }),
        )
      }

      const fileKey = `products/${uuidv4()}-${req.file.originalname}`

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }

      await s3Client.send(new PutObjectCommand(params))
      imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`
    }

    // Update product in database
    const updatedProduct = await pool.query(
      "UPDATE products SET name = $1, description = $2, price = $3, image_url = $4 WHERE id = $5 RETURNING *",
      [name, description, price, imageUrl, id],
    )

    res.status(200).json({
      message: "Product updated successfully",
      product: updatedProduct.rows[0],
    })
  } catch (error) {
    console.error("Update product error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

app.delete("/api/products/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    // Check if product exists and belongs to user
    const productCheck = await pool.query("SELECT * FROM products WHERE id = $1", [id])

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    if (productCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Not authorized to delete this product" })
    }

    // Delete image from S3 if exists
    if (productCheck.rows[0].image_url) {
      const key = productCheck.rows[0].image_url.split(".com/")[1]
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: key,
        }),
      )
    }

    // Delete product from database
    await pool.query("DELETE FROM products WHERE id = $1", [id])

    res.status(200).json({ message: "Product deleted successfully" })
  } catch (error) {
    console.error("Delete product error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// User profile route
app.get("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const user = await pool.query("SELECT id, username, email, created_at FROM users WHERE id = $1", [userId])

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    res.status(200).json(user.rows[0])
  } catch (error) {
    console.error("Get user profile error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get user's products
app.get("/api/user/products", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const products = await pool.query("SELECT * FROM products WHERE user_id = $1 ORDER BY created_at DESC", [userId])

    // Generate signed URLs for S3 images
    const productsWithSignedUrls = await Promise.all(
      products.rows.map(async (product) => {
        if (product.image_url) {
          const key = product.image_url.split(".com/")[1]
          const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: key,
          })
          const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
          return { ...product, signed_image_url: signedUrl }
        }
        return product
      }),
    )

    res.status(200).json(productsWithSignedUrls)
  } catch (error) {
    console.error("Get user products error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" })
})

// Start server
const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
