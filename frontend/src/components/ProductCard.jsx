"use client"
import { Link } from "react-router-dom"
import { formatCurrency } from "../utils/format"

const ProductCard = ({ product, isOwner = false, onDelete }) => {
  const imageUrl = product.signed_image_url || product.image_url || "/placeholder.svg?height=200&width=300"

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden transition-transform hover:scale-105">
      <div className="h-48 overflow-hidden">
        <img src={imageUrl || "/placeholder.svg"} alt={product.name} className="w-full h-full object-cover" />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2 truncate">{product.name}</h3>
        <p className="text-gray-600 text-sm mb-2 line-clamp-2">{product.description}</p>
        <p className="text-emerald-600 font-bold">{formatCurrency(product.price)}</p>

        <div className="mt-4 flex justify-between">
          <Link to={`/products/${product.id}`} className="text-emerald-600 hover:text-emerald-800 font-medium">
            View Details
          </Link>

          {isOwner && (
            <div className="flex space-x-2">
              <Link to={`/edit-product/${product.id}`} className="text-blue-600 hover:text-blue-800">
                Edit
              </Link>
              <button onClick={() => onDelete(product.id)} className="text-red-600 hover:text-red-800">
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProductCard
