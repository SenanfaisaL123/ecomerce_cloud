"use client"

import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import api from "../services/api"
import { formatCurrency } from "../utils/format"
import toast from "react-hot-toast"

const ProductDetail = () => {
  const { id } = useParams()
  const { isAuthenticated, currentUser } = useAuth()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await api.get(`/products/${id}`)
        setProduct(response.data)
      } catch (error) {
        console.error("Error fetching product:", error)
        toast.error("Failed to load product details")
      } finally {
        setLoading(false)
      }
    }

    fetchProduct()
  }, [id])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Product Not Found</h2>
        <p className="text-gray-600 mb-6">The product you're looking for doesn't exist or has been removed.</p>
        <Link to="/" className="bg-emerald-600 text-white py-2 px-6 rounded-lg hover:bg-emerald-700 transition">
          Back to Home
        </Link>
      </div>
    )
  }

  const isOwner = isAuthenticated && currentUser?.id === product.user_id
  const imageUrl = product.signed_image_url || product.image_url || "/placeholder.svg?height=400&width=600"

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="md:flex">
          <div className="md:w-1/2">
            <img src={imageUrl || "/placeholder.svg"} alt={product.name} className="w-full h-full object-cover" />
          </div>

          <div className="md:w-1/2 p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">{product.name}</h1>
            <p className="text-2xl text-emerald-600 font-bold mb-6">{formatCurrency(product.price)}</p>

            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Description</h2>
              <p className="text-gray-600">{product.description}</p>
            </div>

            {isOwner ? (
              <div className="flex space-x-4">
                <Link
                  to={`/edit-product/${product.id}`}
                  className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition"
                >
                  Edit Product
                </Link>
                <Link
                  to="/my-products"
                  className="bg-gray-600 text-white py-2 px-6 rounded-lg hover:bg-gray-700 transition"
                >
                  My Products
                </Link>
              </div>
            ) : (
              <button
                className="bg-emerald-600 text-white py-3 px-8 rounded-lg hover:bg-emerald-700 transition w-full md:w-auto"
                onClick={() => toast.success("This is a demo app. Purchase functionality is not implemented.")}
              >
                Add to Cart
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Link to="/" className="text-emerald-600 hover:text-emerald-800 font-medium flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Products
        </Link>
      </div>
    </div>
  )
}

export default ProductDetail
